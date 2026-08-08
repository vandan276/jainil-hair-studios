from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import jwt
import time
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from io import BytesIO
import base64

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response as FResponse, RedirectResponse, FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
import mimetypes
import firebase_admin
from firebase_admin import credentials, firestore, storage
import json
from pydantic import BaseModel, Field, EmailStr
import requests

# ----- Config -----
JWT_SECRET = os.environ['JWT_SECRET']
ADMIN_EMAIL = os.environ['ADMIN_EMAIL'].lower()
ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
JWT_ALGO = "HS256"

# ----- Object Storage (Firebase) -----
STORAGE_BUCKET = os.environ.get("FIREBASE_STORAGE_BUCKET", "eminence-e436f.appspot.com")
APP_NAME = os.environ.get("APP_NAME", "eminence-salon")


# ----- Local disk storage (replaces Firebase Storage) -----
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Save file to local disk under uploads/ directory."""
    safe_path = path.replace("/", "_").replace("\\", "_")
    dest = UPLOADS_DIR / safe_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return {"path": safe_path, "size": len(data), "local": True}


# ----- Firebase Init -----
firebase_creds_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
if firebase_creds_json:
    try:
        creds_dict = json.loads(firebase_creds_json)
        cred = credentials.Certificate(creds_dict)
        firebase_admin.initialize_app(cred)
    except Exception:
        firebase_admin.initialize_app()
else:
    local_creds = ROOT_DIR / 'firebase-adminsdk.json'
    if local_creds.exists():
        cred = credentials.Certificate(str(local_creds))
        firebase_admin.initialize_app(cred, {'storageBucket': STORAGE_BUCKET})
    else:
        try:
            firebase_admin.initialize_app(options={'storageBucket': STORAGE_BUCKET})
        except Exception:
            pass

db = firestore.client()

app = FastAPI(title="Eminence Salon API")
api = APIRouter(prefix="/api")

logger = logging.getLogger("eminence")
logging.basicConfig(level=logging.INFO)


# ----- Middleware -----
@app.middleware("http")
async def log_requests(request: Request, call_next):
    if "/api/admin/upload" in request.url.path:
        logger.info(f"--- UPLOAD DEBUG START ---")
        logger.info(f"Request: {request.method} {request.url}")
        logger.info(f"Headers: {dict(request.headers)}")
        logger.info(f"--- UPLOAD DEBUG END ---")
    return await call_next(request)


# ----- Helpers -----
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def create_access_token(uid: str, email: str, role: str) -> str:
    payload = {"sub": uid, "email": email, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---- In-memory cache to reduce Firestore reads ----
_cache: dict = {}

def cache_get(key: str):
    """Return cached value if not expired, else None."""
    entry = _cache.get(key)
    if entry and (time.time() - entry["ts"]) < entry["ttl"]:
        return entry["val"]
    return None

def cache_set(key: str, value, ttl: int = 300):
    """Store value in cache with given TTL in seconds."""
    _cache[key] = {"val": value, "ts": time.time(), "ttl": ttl}

def cache_bust(key: str):
    """Invalidate a specific cache key."""
    _cache.pop(key, None)


def fix_urls(item):
    if not item: return item
    for key in ["image_url", "video_url"]:
        val = item.get(key)
        if val and ("localhost" in val or "127.0.0.1" in val):
            path = val.split(":8000/")[-1].split(":3000/")[-1].lstrip("/")
            if not path.startswith("api/"): path = "api/files/" + path
            item[key] = "/" + path
    if "images" in item and isinstance(item.get("images"), list):
        new_imgs = []
        for img in item["images"]:
            if img and ("localhost" in img or "127.0.0.1" in img):
                path = img.split(":8000/")[-1].split(":3000/")[-1].lstrip("/")
                if not path.startswith("api/"): path = "api/files/" + path
                new_imgs.append("/" + path)
            else: new_imgs.append(img)
        item["images"] = new_imgs
    return item


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user_doc = db.collection("users").document(payload["sub"]).get()
    if not user_doc.exists:
        raise HTTPException(401, "User not found")
    user = user_doc.to_dict()
    if user.get("is_active") is False:
        raise HTTPException(403, "Account deactivated")
    user.pop("password_hash", None)
    return user


async def get_optional_user(request: Request) -> Optional[dict]:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_doc = db.collection("users").document(payload["sub"]).get()
        if user_doc.exists:
            user = user_doc.to_dict()
            if user.get("is_active") is not False:
                user.pop("password_hash", None)
                return user
    except:
        pass
    return None




async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    return user


async def require_receptionist(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ["admin", "receptionist"]:
        raise HTTPException(403, "Receptionist or Admin access required")
    return user


async def require_employee(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ["admin", "employee", "sales", "service", "receptionist"]:
        raise HTTPException(403, "Staff or Admin access required")
    return user


class BranchIn(BaseModel):
    name: str

class ProductTransferIn(BaseModel):
    product_id: str
    quantity: int
    source: str
    destination: str
    employee_id: str
    employee_name: str
    remarks: Optional[str] = ""

class RegisterIn(BaseModel):

    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    phone_numbers: Optional[List[str]] = None
    role: Optional[str] = None    # "sales" or "service" (for admin creation)
    branch: Optional[str] = None  # Surat, Baroda
    section: Optional[str] = None # Men, Female
    pancard: Optional[str] = None
    adhaar_card: Optional[str] = None
    bank_details: Optional[str] = None
    commission_rate: Optional[float] = None
    pancard_image: Optional[str] = None
    adhaar_card_image: Optional[str] = None
    base_salary: Optional[float] = None
    # Service provider specific fields
    date_of_birth: Optional[str] = None
    working_hours_from: Optional[str] = None
    working_hours_to: Optional[str] = None
    service_provider_type: Optional[str] = None
    emergency_contact_number: Optional[str] = None
    emergency_contact_person: Optional[str] = None
    address: Optional[str] = None
    gender: Optional[str] = None
    date_of_joining: Optional[str] = None
    id_proof_image: Optional[str] = None
    photo: Optional[str] = None
    product_commission_rate: Optional[float] = None
    username: Optional[str] = None



class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ServiceIn(BaseModel):
    name: str
    category: str
    description: Optional[str] = ""
    price: float
    duration_min: int
    image_url: Optional[str] = None
    membership_price: Optional[float] = None
    reward_points: Optional[int] = 0
    service_for: Optional[str] = "Men & Women"
    hide_on_website: Optional[bool] = False


class MembershipIn(BaseModel):
    name: str
    price: float
    duration_days: int
    reward_points_on_purchase: Optional[int] = 0
    discount_on_services: Optional[float] = 0
    discount_on_services_type: Optional[str] = "%"
    discount_on_products: Optional[float] = 0
    discount_on_products_type: Optional[str] = "%"
    discount_on_packages: Optional[float] = 0
    discount_on_packages_type: Optional[str] = "%"
    reward_points_boost: Optional[str] = "1X"
    min_reward_points_earned: Optional[int] = 0
    condition: Optional[str] = "AND"
    min_billed_amount: Optional[float] = 0


class PackageServiceItem(BaseModel):
    category: str = ""
    service_name: str = ""
    quantity: int = 1
    price: float = 0

class PackageIn(BaseModel):
    name: str
    duration_days: int
    valid_till: str
    price: float
    services: List[dict] = []


class ProductCategoryIn(BaseModel):
    name: str

class ProductIn(BaseModel):
    name: str
    category: str
    description: str
    price: float
    stock: int = 100
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    target_audience: Optional[str] = "Women"
    show_in_online_shop: Optional[bool] = False
    in_saloon: Optional[bool] = False
    is_retail: Optional[bool] = True
    measurement_unit: Optional[str] = None
    volume: Optional[str] = None
    length_inches: Optional[str] = None
    colour: Optional[str] = None
    size: Optional[str] = None

class SalonProductIn(BaseModel):
    name: str
    category: str
    unit: str # L, ML, GM, PCK, PKT
    stock: float = 0.0
    price: float = 0.0
    description: Optional[str] = ""

class VendorIn(BaseModel):
    name: str
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    gst_no: Optional[str] = ""


class StylistIn(BaseModel):
    name: str
    role: str
    bio: Optional[str] = ""
    image_url: Optional[str] = None
    specialties: List[str] = []


class BookingIn(BaseModel):
    service_id: str
    stylist_id: Optional[str] = None
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    notes: Optional[str] = ""


class CartItem(BaseModel):
    product_id: str
    quantity: int
    package_id: Optional[str] = None
    service_provider: Optional[str] = None
    service_provider_2: Optional[str] = None
    discount: Optional[float] = 0.0
    discount_type: Optional[str] = "INR"


class OrderIn(BaseModel):
    items: List[CartItem]
    full_name: str
    phone: str
    address: str
    city: str = "Vadodara"
    pincode: str
    notes: Optional[str] = ""
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    payment_method: Optional[str] = None
    split_payments: Optional[List[dict]] = None
    discount: Optional[float] = 0.0
    add_to_wallet: Optional[bool] = False
    created_at: Optional[str] = None
    branch: Optional[str] = None
    shipment_date: Optional[str] = None
    shipped_date: Optional[str] = None
    courier_name: Optional[str] = None
    tracking_number: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str


class ConsultationIn(BaseModel):
    name: str
    phone: str
    date: str
    time: str
    concerns: str


class LeadIn(BaseModel):
    name: str
    phone: str
    secondary_phone: Optional[str] = None
    branch: str = "Surat"
    section: str = "Men"
    source: str = "manual"
    campaign: Optional[str] = None
    notes: Optional[str] = None
    grade: Optional[str] = None # Hot, Warm, Cold
    city: Optional[str] = None
    hair_condition: Optional[str] = None
    is_client: Optional[bool] = False
    status: Optional[str] = "new"
    gender: Optional[str] = "—"
    email: Optional[str] = "—"
    points: Optional[int] = 0
    dob: Optional[str] = None
    anniversary: Optional[str] = None
    address: Optional[str] = None


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    branch: Optional[str] = None
    section: Optional[str] = None
    city: Optional[str] = None
    status: Optional[str] = None
    follow_up_date: Optional[str] = None # YYYY-MM-DD
    follow_up_time: Optional[str] = None # HH:MM
    follow_up_type: Optional[str] = None # Call, Visit, WhatsApp
    assigned_to: Optional[str] = None
    grade: Optional[str] = None
    is_favorite: Optional[bool] = None
    hair_condition: Optional[str] = None
    packages: Optional[List[dict]] = None
    total_sale_amount: Optional[float] = None
    gender: Optional[str] = None
    email: Optional[str] = None
    points: Optional[int] = None
    dob: Optional[str] = None
    anniversary: Optional[str] = None
    address: Optional[str] = None


class LeadNoteIn(BaseModel):
    text: str


class TransferLeadIn(BaseModel):
    email: Optional[str] = None
    target_id: Optional[str] = None


class VisitUpdateIn(BaseModel):
    visit_date: Optional[str] = None
    visit_time: Optional[str] = None
    liked: Optional[bool] = None
    service_days: Optional[int] = None
    note: Optional[str] = None


class CallLogIn(BaseModel):
    duration: int # Seconds
    talk_time: int # Seconds
    outcome: str # Picked Up, Not Picked Up, Said No
    comment: Optional[str] = None
    grade: Optional[str] = None # Hot, Warm, Cold
    next_followup_date: Optional[str] = None
    next_followup_time: Optional[str] = None
    sale_amount: Optional[float] = None
    payment_mode: Optional[str] = None
    consulted_by: Optional[str] = None


class ManualSaleIn(BaseModel):
    employee_id: str
    amount: float
    date: str  # YYYY-MM-DD
    note: Optional[str] = None

class AttendanceVerifyIn(BaseModel):
    photo_base64: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


# ----- Auth endpoints -----
@api.post("/auth/register")
def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    docs = db.collection("users").where("email", "==", email).limit(1).get()
    if len(docs) > 0:
        raise HTTPException(400, "Email already registered")
    uid = new_id()
    user_doc = {
        "id": uid,
        "name": data.name,
        "email": email,
        "password_hash": hash_password(data.password),
        "phone": data.phone or "",
        "role": "user",
        "created_at": now_iso(),
    }
    db.collection("users").document(uid).set(user_doc)
    token = create_access_token(uid, email, "user")
    response.set_cookie("access_token", token, httponly=True, samesite="lax",
                        max_age=7 * 24 * 3600, path="/")
    
    user_doc.pop("password_hash", None)
    return {**user_doc, "token": token}


@api.post("/auth/login")
def login(data: LoginIn, response: Response):
    email = data.email.lower()
    docs = db.collection("users").where("email", "==", email).limit(1).get()
    if not docs:
        raise HTTPException(401, "Invalid email or password")
    user = docs[0].to_dict()
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_access_token(user["id"], email, user["role"])
    response.set_cookie("access_token", token, httponly=True, samesite="lax",
                        max_age=7 * 24 * 3600, path="/")
    
    user.pop("password_hash", None)
    return {**user, "token": token}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.get("/users/me/leaves")
def get_my_leaves(user: dict = Depends(get_current_user)):
    user_doc = db.collection("users").document(user["id"]).get()
    if not user_doc.exists:
        raise HTTPException(404, "User not found")
    udata = user_doc.to_dict()
    official_leaves = udata.get("leaves", [])
    
    # Also fetch all their leave requests
    req_docs = db.collection("leave_requests").where("user_id", "==", user["id"]).stream()
    requests = [r.to_dict() for r in req_docs]
    return {"leaves": official_leaves, "requests": requests}

@api.post("/users/me/leaves/request")
def request_my_leave(data: dict, user: dict = Depends(get_current_user)):
    date_str = data.get("date")
    if not date_str:
        raise HTTPException(400, "Date is required")
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date format. Expected YYYY-MM-DD")
        
    # Check if a request already exists for this date
    existing = list(db.collection("leave_requests").where("user_id", "==", user["id"]).where("date", "==", date_str).stream())
    if existing:
        raise HTTPException(400, "A leave request or approved leave already exists for this date")
        
    rid = new_id()
    request_doc = {
        "id": rid,
        "user_id": user["id"],
        "user_name": user.get("name") or "Employee",
        "branch": user.get("branch") or "Baroda",
        "date": date_str,
        "status": "pending",
        "created_at": now_iso()
    }
    db.collection("leave_requests").document(rid).set(request_doc)
    return {"ok": True, "request": request_doc}

@api.post("/users/me/leaves/cancel")
def cancel_my_leave(data: dict, user: dict = Depends(get_current_user)):
    date_str = data.get("date")
    if not date_str:
        raise HTTPException(400, "Date is required")
        
    # Delete the leave request
    reqs = list(db.collection("leave_requests").where("user_id", "==", user["id"]).where("date", "==", date_str).stream())
    for r in reqs:
        db.collection("leave_requests").document(r.id).delete()
        
    # Remove from official leaves array if it was approved
    user_ref = db.collection("users").document(user["id"])
    u_dict = user_ref.get().to_dict()
    leaves = u_dict.get("leaves", [])
    if date_str in leaves:
        leaves = [d for d in leaves if d != date_str]
        user_ref.update({"leaves": leaves})
        
    return {"ok": True}

class AdminLeaveRequestIn(BaseModel):
    employee_id: str
    date: str

@api.post("/admin/leaves/request")
def admin_create_leave_request(data: AdminLeaveRequestIn, admin: dict = Depends(require_admin)):
    try:
        datetime.strptime(data.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date format. Expected YYYY-MM-DD")

    emp_doc = db.collection("users").document(data.employee_id).get()
    if not emp_doc.exists:
        raise HTTPException(404, "Employee not found")
    
    emp = emp_doc.to_dict()
    
    # Check if a request already exists for this date
    existing = list(db.collection("leave_requests").where("user_id", "==", data.employee_id).where("date", "==", data.date).stream())
    if existing:
        raise HTTPException(400, "A leave request or approved leave already exists for this date")

    rid = new_id()
    request_doc = {
        "id": rid,
        "user_id": data.employee_id,
        "user_name": emp.get("name") or "Employee",
        "branch": emp.get("branch") or "Baroda",
        "date": data.date,
        "status": "pending",
        "created_at": now_iso()
    }
    db.collection("leave_requests").document(rid).set(request_doc)
    return request_doc

@api.get("/admin/leaves")
def get_admin_leaves(admin: dict = Depends(require_admin)):
    branch = admin.get("branch")
    is_super = admin.get("email", "").lower() == "superadmin@eminence.com" or admin.get("role") == "super_admin" or admin.get("is_super_admin") is True
    
    docs = db.collection("leave_requests").stream()
    results = []
    for d in docs:
        r = d.to_dict()
        # If not superadmin, only show requests from the admin's branch
        if not is_super and branch and r.get("branch") != branch:
            continue
        results.append(r)
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results

@api.post("/admin/leaves/{rid}/approve")
def approve_leave_request(rid: str, admin: dict = Depends(require_admin)):
    doc_ref = db.collection("leave_requests").document(rid)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(404, "Leave request not found")
    r = doc.to_dict()
    
    is_super = admin.get("email", "").lower() == "superadmin@eminence.com" or admin.get("role") == "super_admin" or admin.get("is_super_admin") is True
    current_status = r.get("status", "pending")
    
    if is_super:
        if current_status == "pending":
            doc_ref.update({"status": "super_approved"})
            return {"ok": True, "status": "super_approved"}
        else:
            raise HTTPException(400, f"Superadmin cannot approve a request with status: {current_status}")
    else:
        # Branch Admin
        if current_status == "super_approved":
            doc_ref.update({"status": "approved"})
            # Also append to the user's leaves array
            uid = r.get("user_id")
            date_str = r.get("date")
            user_ref = db.collection("users").document(uid)
            u_doc = user_ref.get()
            if u_doc.exists:
                leaves = u_doc.to_dict().get("leaves", [])
                if date_str not in leaves:
                    leaves.append(date_str)
                    user_ref.update({"leaves": leaves})
            return {"ok": True, "status": "approved"}
        else:
            raise HTTPException(400, "Branch Admin can only approve requests that are already Superadmin approved")

@api.post("/admin/leaves/{rid}/reject")
def reject_leave_request(rid: str, admin: dict = Depends(require_admin)):
    doc_ref = db.collection("leave_requests").document(rid)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(404, "Leave request not found")
    r = doc.to_dict()
    
    doc_ref.update({"status": "rejected"})
    
    # If it was already approved, remove from user's leaves array
    uid = r.get("user_id")
    date_str = r.get("date")
    user_ref = db.collection("users").document(uid)
    u_doc = user_ref.get()
    if u_doc.exists:
        leaves = u_doc.to_dict().get("leaves", [])
        if date_str in leaves:
            leaves = [d for d in leaves if d != date_str]
            user_ref.update({"leaves": leaves})
            
    return {"ok": True, "status": "rejected"}


@api.get("/attendance/today")
async def check_attendance(user: dict = Depends(require_employee)):
    # Use IST for Indian operations
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today = ist_now.strftime("%Y-%m-%d")
    docs = db.collection("attendance").where("user_id", "==", user["id"]).where("date", "==", today).limit(1).get()
    if docs:
        attendance_data = docs[0].to_dict()
        return {
            "verified": True,
            "shift_completed": "checkout_time" in attendance_data,
            "check_in_time": attendance_data.get("time"),
            "check_out_time": attendance_data.get("checkout_time")
        }
    return {
        "verified": False,
        "shift_completed": False,
        "check_in_time": None,
        "check_out_time": None
    }


@api.post("/attendance/verify")
async def verify_attendance(data: AttendanceVerifyIn, user: dict = Depends(require_employee)):
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today = ist_now.strftime("%Y-%m-%d")
    time_str = ist_now.strftime("%H:%M:%S")
    
    docs = db.collection("attendance").where("user_id", "==", user["id"]).where("date", "==", today).limit(1).get()
    if docs:
        return {"ok": True, "message": "Already verified"}
        
    try:
        if "," in data.photo_base64:
            header, encoded = data.photo_base64.split(",", 1)
            ext = header.split(";")[0].split("/")[-1]
            if ext == "jpeg": ext = "jpg"
        else:
            encoded = data.photo_base64
            ext = "jpg"
        image_data = base64.b64decode(encoded)
    except Exception as e:
        raise HTTPException(400, "Invalid image data")
        
    path = f"attendance/{today}/{user['id']}_{time_str.replace(':', '')}.{ext}"
    upload_res = put_object(path, image_data, f"image/{ext}")
    
    aid = new_id()
    doc = {
        "id": aid,
        "user_id": user["id"],
        "user_name": user["name"],
        "date": today,
        "time": time_str,
        "photo_url": upload_res["path"],
        "status": "present",
        "latitude": data.latitude,
        "longitude": data.longitude,
        "created_at": now_iso()
    }
    db.collection("attendance").document(aid).set(doc)
    return {"ok": True, "attendance": doc}


@api.post("/attendance/checkout")
async def verify_checkout(data: AttendanceVerifyIn, user: dict = Depends(require_employee)):
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today = ist_now.strftime("%Y-%m-%d")
    time_str = ist_now.strftime("%H:%M:%S")
    
    docs = db.collection("attendance").where("user_id", "==", user["id"]).where("date", "==", today).limit(1).get()
    if not docs:
        raise HTTPException(400, "No attendance record found for today. Please check-in first.")
        
    doc_ref = docs[0].reference
    attendance_data = docs[0].to_dict()
    if "checkout_time" in attendance_data:
        return {"ok": True, "message": "Already checked out", "attendance": attendance_data}
        
    try:
        if "," in data.photo_base64:
            header, encoded = data.photo_base64.split(",", 1)
            ext = header.split(";")[0].split("/")[-1]
            if ext == "jpeg": ext = "jpg"
        else:
            encoded = data.photo_base64
            ext = "jpg"
        image_data = base64.b64decode(encoded)
    except Exception as e:
        raise HTTPException(400, "Invalid image data")
        
    path = f"attendance/{today}/{user['id']}_{time_str.replace(':', '')}_checkout.{ext}"
    upload_res = put_object(path, image_data, f"image/{ext}")
    
    update_doc = {
        "checkout_time": time_str,
        "checkout_photo_url": upload_res["path"],
        "checkout_latitude": data.latitude,
        "checkout_longitude": data.longitude,
        "checkout_created_at": now_iso()
    }
    doc_ref.update(update_doc)
    return {"ok": True, "attendance": {**attendance_data, **update_doc}}


@api.get("/admin/attendance")
def admin_attendance(_: dict = Depends(require_admin)):
    docs = db.collection("attendance").order_by("created_at", direction="DESCENDING").limit(500).stream()
    return [d.to_dict() for d in docs]


# ----- Public catalog -----
@api.get("/services")
def list_services(category: Optional[str] = None):
    cached_services = cache_get("raw_services")
    if cached_services is None:
        coll = db.collection("services")
        docs = coll.stream()
        cached_services = [d.to_dict() for d in docs]
        cache_set("raw_services", cached_services, ttl=600)

    items = cached_services
    if category:
        items = [i for i in items if i.get("category") == category]
    return items


@api.get("/services/{sid}")
def get_service(sid: str):
    cached_services = cache_get("raw_services")
    if cached_services is not None:
        for s in cached_services:
            if s.get("id") == sid:
                return s

    doc = db.collection("services").document(sid).get()
    if not doc.exists:
        raise HTTPException(404, "Service not found")
    return doc.to_dict()


@api.get("/products")
async def list_products(request: Request, category: Optional[str] = None, search: Optional[str] = None, all_products: Optional[bool] = False, branch: Optional[str] = None):
    cached_products = cache_get("raw_products")
    if cached_products is None:
        coll = db.collection("products")
        docs = coll.stream()
        cached_products = [d.to_dict() for d in docs]
        cache_set("raw_products", cached_products, ttl=600)

    # Scoping branch-wise
    user = await get_optional_user(request)
    if user and user.get("role") == "admin" and user.get("email", "").lower() != "superadmin@eminence.com":
        branch = user.get("branch")

    items = [fix_urls(item) for item in cached_products]
    
    for i in items:
        b_stock_dict = i.get("branch_stock", {})
        if branch:
            if b_stock_dict:
                i["stock"] = b_stock_dict.get(branch, 0)
            else:
                orig_branch = i.get("branch", "Baroda")
                i["stock"] = i.get("stock", 0) if orig_branch == branch else 0
    if category:
        items = [i for i in items if i.get("category") == category]
    if search:
        search = search.lower()
        items = [i for i in items if search in i.get("name", "").lower()]
    if not all_products:
        items = [i for i in items if i.get("show_in_online_shop") is True]
    return items


@api.get("/products/{pid}")
def get_product(pid: str):
    cached_products = cache_get("raw_products")
    if cached_products is not None:
        for p in cached_products:
            if p.get("id") == pid:
                return fix_urls(p)

    doc = db.collection("products").document(pid).get()
    if not doc.exists:
        raise HTTPException(404, "Product not found")
    return fix_urls(doc.to_dict())


# ----- Reviews -----
class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str


@api.get("/products/{pid}/reviews")
def list_reviews(pid: str):
    docs = (
        db.collection("reviews")
        .where("product_id", "==", pid)
        .stream()
    )
    items = [d.to_dict() for d in docs]
    # Sort newest first in Python (avoids Firestore composite index requirement)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api.post("/products/{pid}/reviews")
def create_review(pid: str, data: ReviewIn, user: dict = Depends(get_current_user)):
    # Check product exists
    if not db.collection("products").document(pid).get().exists:
        raise HTTPException(404, "Product not found")
    rid = new_id()
    review = {
        "id": rid,
        "product_id": pid,
        "user_id": user["id"],
        "user_name": user["name"],
        "rating": data.rating,
        "comment": data.comment.strip(),
        "created_at": now_iso(),
    }
    db.collection("reviews").document(rid).set(review)
    return review


@api.patch("/reviews/{rid}")
def update_review(rid: str, data: ReviewIn, user: dict = Depends(get_current_user)):
    doc_ref = db.collection("reviews").document(rid)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(404, "Review not found")
    review = doc.to_dict()
    if review.get("user_id") != user.get("id") and user.get("role") != "admin":
        raise HTTPException(403, "Not authorized to edit this review")
    review["rating"] = data.rating
    review["comment"] = data.comment.strip()
    review["updated_at"] = now_iso()
    doc_ref.set(review)
    return review



@api.get("/stylists")
def list_stylists():
    cached_stylists = cache_get("raw_stylists")
    if cached_stylists is None:
        docs = db.collection("stylists").stream()
        cached_stylists = [d.to_dict() for d in docs]
        cache_set("raw_stylists", cached_stylists, ttl=600)
    return cached_stylists


# ----- Bookings -----
@api.post("/bookings")
def create_booking(data: BookingIn, user: dict = Depends(get_current_user)):
    service_doc = db.collection("services").document(data.service_id).get()
    if not service_doc.exists:
        raise HTTPException(404, "Service not found")
    service = service_doc.to_dict()
    stylist = None
    if data.stylist_id:
        stylist_doc = db.collection("stylists").document(data.stylist_id).get()
        if not stylist_doc.exists:
            raise HTTPException(404, "Stylist not found")
        stylist = stylist_doc.to_dict()
        # Slot conflict
        conflict = db.collection("bookings") \
            .where("stylist_id", "==", stylist["id"]) \
            .where("date", "==", data.date) \
            .where("time", "==", data.time) \
            .where("status", "!=", "cancelled").limit(1).get()
        if conflict:
            raise HTTPException(409, f"{stylist['name']} is already booked at {data.date} {data.time}.")
    
    bid = new_id()
    booking = {
        "id": bid,
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user["email"],
        "service_id": service["id"],
        "service_name": service["name"],
        "service_price": service["price"],
        "stylist_id": stylist["id"] if stylist else None,
        "stylist_name": stylist["name"] if stylist else "Any available",
        "date": data.date,
        "time": data.time,
        "notes": data.notes or "",
        "status": "pending",
        "created_at": now_iso(),
    }
    db.collection("bookings").document(bid).set(booking)
    return booking


@api.get("/bookings/me")
def my_bookings(user: dict = Depends(get_current_user)):
    docs = db.collection("bookings").where("user_id", "==", user["id"]).order_by("created_at", direction="DESCENDING").stream()
    return [d.to_dict() for d in docs]


@api.get("/bookings")
def list_all_bookings(user: dict = Depends(require_employee)):
    docs = db.collection("bookings").stream()
    items = [d.to_dict() for d in docs]
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api.patch("/bookings/{bid}")
def update_booking(bid: str, data: StatusUpdate, user: dict = Depends(require_employee)):
    doc_ref = db.collection("bookings").document(bid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Booking not found")
    doc_ref.update({"status": data.status})
    return {"ok": True}


# ----- Orders -----
@api.post("/orders")
def create_order(data: OrderIn, user: dict = Depends(get_current_user)):
    if not data.items:
        raise HTTPException(400, "Cart is empty")
        
    total_price = 0
    items_to_update = []
    items_detail = []
    
    # Resolve customer / lead
    phone = data.phone
    lead_docs = []
    if phone:
        phone_clean = "".join(filter(str.isdigit, phone))
        # Multi-fallback phone matching
        # 1. Exact phone match
        lead_docs = list(db.collection("leads").where("phone", "==", phone).limit(1).stream())
        # 2. Add '+' prefix if missing
        if not lead_docs and not phone.startswith("+"):
            lead_docs = list(db.collection("leads").where("phone", "==", "+" + phone).limit(1).stream())
        # 3. Remove '+' prefix if present
        if not lead_docs and phone.startswith("+"):
            lead_docs = list(db.collection("leads").where("phone", "==", phone[1:]).limit(1).stream())
        # 4. Clean digits match
        if not lead_docs and phone_clean and phone_clean != phone:
            lead_docs = list(db.collection("leads").where("phone", "==", phone_clean).limit(1).stream())
        # 5. Clean digits with '+' prefix
        if not lead_docs and phone_clean:
            lead_docs = list(db.collection("leads").where("phone", "==", "+" + phone_clean).limit(1).stream())
        # 6. 10 digits match with '+91' prefix
        if not lead_docs and len(phone_clean) == 10:
            lead_docs = list(db.collection("leads").where("phone", "==", "+91" + phone_clean).limit(1).stream())
        # 7. 10 digits match with '91' prefix
        if not lead_docs and len(phone_clean) == 10:
            lead_docs = list(db.collection("leads").where("phone", "==", "91" + phone_clean).limit(1).stream())
        # 8. Try stripping '91' prefix
        if not lead_docs and phone_clean.startswith("91") and len(phone_clean) > 10:
            lead_docs = list(db.collection("leads").where("phone", "==", phone_clean[2:]).limit(1).stream())

    lead_ref = None
    lead_data = {}
    if lead_docs:
        lead_ref = lead_docs[0].reference
        lead_data = lead_docs[0].to_dict()
        if "packages" not in lead_data or lead_data.get("packages") is None:
            lead_data["packages"] = []
        
    for item in data.items:
        item_id = item.product_id
        quantity = item.quantity
        package_id = item.package_id
        
        is_service = False
        is_package = False
        
        # 1. Search products
        prod_ref = db.collection("products").document(item_id)
        prod_snap = prod_ref.get()
        if prod_snap.exists:
            prod = prod_snap.to_dict()
            item_name = prod["name"]
            item_price = prod.get("price", 0)
            
            # Stock management for physical products
            current_stock = prod.get("stock", 0)
            if current_stock < quantity:
                raise HTTPException(400, f"Insufficient stock for {item_name}. Available: {current_stock}")
            items_to_update.append({
                "ref": prod_ref,
                "name": item_name,
                "new_stock": current_stock - quantity
            })
        else:
            # 2. Search services
            svc_ref = db.collection("services").document(item_id)
            svc_snap = svc_ref.get()
            if svc_snap.exists:
                prod = svc_snap.to_dict()
                item_name = prod["name"]
                item_price = prod.get("price", 0)
                is_service = True
            else:
                # 3. Search packages
                pkg_ref = db.collection("packages").document(item_id)
                pkg_snap = pkg_ref.get()
                if pkg_snap.exists:
                    prod = pkg_snap.to_dict()
                    item_name = prod["name"]
                    item_price = prod.get("price", 0)
                    is_package = True
                else:
                    raise HTTPException(404, f"Product/Service/Package {item_id} not found")
                    
        # Package deduction logic
        actual_price = item_price
        if is_service and package_id and lead_ref:
            packages_list = lead_data.get("packages", [])
            package_found = False
            updated_packages = []
            
            for pkg in packages_list:
                if pkg.get("id") == package_id or pkg.get("package_id") == package_id:
                    for s_item in pkg.get("services", []):
                        if s_item.get("service_name") == item_name:
                            rem = s_item.get("remaining_quantity", 0)
                            if rem >= quantity:
                                s_item["remaining_quantity"] = rem - quantity
                                actual_price = 0.0
                                package_found = True
                                break
                updated_packages.append(pkg)
                
            if package_found:
                lead_data["packages"] = updated_packages
            else:
                raise HTTPException(400, f"Cannot deduct service '{item_name}' from package: insufficient quantity or invalid package")
                
        line_total = actual_price * quantity
        total_price += line_total
        
        items_detail.append({
            "product_id": item_id,
            "name": item_name,
            "price": item_price,
            "quantity": quantity,
            "image_url": prod.get("image_url") or prod.get("photo"),
            "line_total": line_total,
            "is_service": is_service,
            "is_package": is_package,
            "package_deducted": (actual_price == 0.0 and is_service and package_id is not None),
            "package_id": package_id,
            "service_provider": item.service_provider,
            "service_provider_2": item.service_provider_2,
            "discount": item.discount or 0.0,
            "discount_type": item.discount_type or "INR"
        })
        
        # Package purchase logic
        if is_package and lead_ref:
            duration = prod.get("duration_days", 180)
            expires_at = (datetime.now() + timedelta(days=duration)).isoformat()[:10]
            pkg_services = []
            for s_item in prod.get("services", []):
                pkg_services.append({
                    "category": s_item.get("category", ""),
                    "service_name": s_item.get("service_name", ""),
                    "total_quantity": s_item.get("quantity", 1),
                    "remaining_quantity": s_item.get("quantity", 1),
                    "price": s_item.get("price", 0)
                })
            
            new_pkg = {
                "id": new_id(),
                "package_id": item_id,
                "name": item_name,
                "purchased_at": now_iso()[:10],
                "expires_at": expires_at,
                "services": pkg_services,
                "status": "active"
            }
            if "packages" not in lead_data or not lead_data["packages"]:
                lead_data["packages"] = []
            lead_data["packages"].append(new_pkg)
    # Wallet Logic & Validation
    final_total = round(total_price, 2)
    e_wallet_amount = 0.0
    total_paid = 0.0
    if data.split_payments:
        for payment in data.split_payments:
            amt = float(payment.get("amount", 0.0))
            total_paid += amt
            if payment.get("method") == "E-wallet":
                e_wallet_amount += amt
    else:
        if data.payment_method == "E-wallet":
            e_wallet_amount = final_total
        total_paid = final_total

    if e_wallet_amount > 0:
        if not lead_ref:
            raise HTTPException(400, "Walk-in clients cannot use E-wallet payment method. Please select/create a client profile.")
        current_wallet = float(lead_data.get("wallet", 0.0))
        if current_wallet < e_wallet_amount:
            raise HTTPException(400, f"Insufficient E-wallet balance. Available: {current_wallet}, Attempted: {e_wallet_amount}")

    # If add_to_wallet is requested but no lead profile exists, silently skip — don't block bill generation

    if lead_ref:
        current_wallet = float(lead_data.get("wallet", 0.0))
        wallet_delta = -e_wallet_amount
        if data.add_to_wallet and total_paid > final_total:
            change = total_paid - final_total
            wallet_delta += change
        
        if wallet_delta != 0:
            new_wallet = round(current_wallet + wallet_delta, 2)
            lead_data["wallet"] = new_wallet
            lead_ref.update({"wallet": new_wallet})

    # Update Stock for physical products
    for update in items_to_update:
        update["ref"].update({"stock": update["new_stock"]})
        
    oid = new_id()
    order = {
        "id": oid,
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user["email"],
        "items": items_detail,
        "total": round(total_price, 2),
        "discount": round(data.discount or 0.0, 2),
        "full_name": data.full_name,
        "phone": data.phone,
        "address": data.address,
        "city": data.city,
        "pincode": data.pincode,
        "notes": data.notes or "",
        "status": "placed",
        "payment": "COD",
        "payment_method": data.payment_method,
        "split_payments": data.split_payments,
        "employee_id": data.employee_id,
        "employee_name": data.employee_name,
        "branch": data.branch or user.get("branch") or "Baroda",
        "shipment_date": data.shipment_date,
        "shipped_date": data.shipped_date,
        "courier_name": data.courier_name,
        "tracking_number": data.tracking_number,
        "created_at": data.created_at or now_iso(),
    }
    db.collection("orders").document(oid).set(order)

    # Keep revenue_cache in sync — increment by order total so we never need a full rescan
    try:
        from google.cloud.firestore import Increment as FSIncrement
        db.collection("settings").document("revenue_cache").set(
            {"total": FSIncrement(order.get("total", 0)), "updated_at": now_iso()},
            merge=True
        )
    except Exception:
        pass  # Non-critical; will rescan on next cold start if needed

    # Bust the in-memory stats cache so dashboard shows the new order
    cache_bust("admin_stats")

    # Update Lead Packages, visit count, total spendings, and last visit date
    if lead_ref and lead_data:
        from google.cloud.firestore import Increment as FSIncrement
        lead_ref.update({
            "packages": lead_data.get("packages", []),
            "visit_count": FSIncrement(1),
            "total_sale_amount": FSIncrement(final_total),
            "last_visit_date": now_iso()[:10]
        })

    return order


@api.get("/orders/me")
def my_orders(user: dict = Depends(get_current_user)):
    docs = db.collection("orders").where("user_id", "==", user["id"]).order_by("created_at", direction="DESCENDING").stream()
    return [d.to_dict() for d in docs]


@api.get("/orders/{oid}/invoice")
def get_order_invoice(oid: str):
    doc = db.collection("orders").document(oid).get()
    if not doc.exists:
        raise HTTPException(404, "Order not found")
    order = doc.to_dict()

    # Fetch all employees/stylists to map IDs to names
    employees_map = {}
    try:
        emp_docs = db.collection("users").where("role", "in", ["sales", "service", "employee", "admin", "receptionist"]).stream()
        for emp_doc in emp_docs:
            d = emp_doc.to_dict()
            employees_map[d["id"]] = d.get("name", "")
    except Exception as e:
        logger.error(f"Error fetching employees map: {e}")

    # Resolve customer wallet balance by looking up lead
    phone = order.get("phone", "")
    lead_wallet = 0.0
    if phone:
        clean_phone = phone
        if not clean_phone.startswith("+"):
            clean_phone = "+" + clean_phone
        leads = list(db.collection("leads").where("phone", "==", clean_phone).limit(1).stream())
        if not leads:
            leads = list(db.collection("leads").where("phone", "==", phone).limit(1).stream())
        if leads:
            lead_wallet = float(leads[0].to_dict().get("wallet", 0.0))

    # Clean phone number (remove +91 prefix for visual cleanliness)
    phone_number = phone
    if phone_number.startswith("+91"):
        phone_number = phone_number[3:]

    # Resolve branch name & contact number from employee assigned
    branch_name = "Subhanpura"
    branch_contact = "7405088809"
    emp_id = order.get("employee_id")
    if emp_id:
        emp_doc = db.collection("users").document(emp_id).get()
        if emp_doc.exists:
            emp_branch = emp_doc.to_dict().get("branch")
            if emp_branch:
                branch_name = emp_branch
                if emp_branch.lower() == "surat":
                    branch_contact = "8799288809"

    # Extract tax details from order notes
    notes_str = order.get("notes", "")
    tax_rate = 0.0
    tax_inclusive = False
    if "Tax: " in notes_str:
        parts = notes_str.split("Tax: ")
        if len(parts) > 1:
            tax_part = parts[1].split(" | ")[0]
            if "Inclusive" in tax_part:
                tax_inclusive = True
            if "18%" in tax_part:
                tax_rate = 0.18
            elif "5%" in tax_part:
                tax_rate = 0.05

    # Invoice sequence number formatting (E.g. 0948/B2C/26-27)
    try:
        hex_val = int(order.get("id", "")[:8], 16)
        serial = str(hex_val % 10000).zfill(4)
    except:
        serial = "0001"

    created_str = order.get("created_at", "")
    dt = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    if created_str:
        try:
            dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
            ist = timezone(timedelta(hours=5, minutes=30))
            dt = dt.astimezone(ist)
        except:
            pass

    year = dt.year
    if dt.month >= 4:
        fy_start = str(year)[2:]
        fy_end = str(year + 1)[2:]
    else:
        fy_start = str(year - 1)[2:]
        fy_end = str(year)[2:]
    fy_str = f"{fy_start}-{fy_end}"
    invoice_no = f"{serial}/B2C/{fy_str}"
    invoice_date = dt.strftime("%d-%m-%Y %I:%M %p")

    # Math calculations
    items = order.get("items", [])
    subtotal_before_tax_and_disc = sum(it.get("line_total", 0) for it in items)
    point_discount = float(order.get("discount_from_points", 0.0))
    grand_total = float(order.get("total", 0.0))

    if tax_inclusive:
        taxable_base = (subtotal_before_tax_and_disc - point_discount) / (1.0 + tax_rate)
        total_tax = (subtotal_before_tax_and_disc - point_discount) - taxable_base
    else:
        taxable_base = subtotal_before_tax_and_disc - point_discount
        total_tax = taxable_base * tax_rate

    # Amount Paid and Due
    total_paid = 0.0
    split_payments = order.get("split_payments", [])
    if split_payments:
        total_paid = sum(float(p.get("amount", 0.0)) for p in split_payments)
    else:
        total_paid = grand_total
    amount_due = max(0.0, grand_total - total_paid)

    # Dynamic page height calculation based on item name and provider text lengths
    def wrap_text(text, max_chars):
        if not text:
            return [""]
        words = text.split()
        lines = []
        curr_line = ""
        for w in words:
            if len(curr_line) + len(w) + 1 <= max_chars:
                curr_line = curr_line + (" " if curr_line else "") + w
            else:
                lines.append(curr_line)
                curr_line = w
        if curr_line:
            lines.append(curr_line)
        return lines

    # Calculate height contribution of rows
    row_heights_sum = 0
    for it in items:
        name_lines = len(wrap_text(it.get("name", ""), 18))
        providers = []
        p1 = it.get("service_provider")
        p2 = it.get("service_provider_2")
        if p1: providers.append(employees_map.get(p1, p1))
        if p2: providers.append(employees_map.get(p2, p2))
        for extra_id in it.get("extra_providers", []):
            if extra_id: providers.append(employees_map.get(extra_id, extra_id))
        provider_name = ", ".join(providers) if providers else "—"
        provider_lines = len(wrap_text(provider_name, 14))
        num_lines = max(name_lines, provider_lines)
        row_heights_sum += num_lines * 9 + 4

    page_width = 280
    page_height = 360 + row_heights_sum

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(page_width, page_height))

    # Helper function for drawing dashed separators
    def draw_dashed_line(y_pos):
        c.setLineWidth(0.5)
        c.setStrokeColorRGB(0.5, 0.5, 0.5)
        c.setDash(2, 2)
        c.line(12, y_pos, page_width - 12, y_pos)
        c.setDash()

    # ── HEADER (Centered) ──────────────────────────────────────────────────
    c.setFont("Helvetica", 7.5)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    header_lines = [
        "GF-7 SHRINATH COMPLEX, NR RELIANCE",
        "PETROL PUMP, HIGH TENSION ROAD,",
        "SUBHANPURA VADODARA",
        f"Contact : {branch_contact}",
        "Email : eminencesalon0@gmail.com",
        "Website : www.eminencehair.com",
        "GST No : 24AGAPV1520E1ZX"
    ]
    hy = page_height - 15
    for line in header_lines:
        c.drawCentredString(page_width / 2, hy, line)
        hy -= 10

    hy -= 4
    c.setFont("Helvetica-Bold", 10.5)
    c.drawCentredString(page_width / 2, hy, "SALES INVOICE")
    hy -= 11
    c.setFont("Helvetica", 8)
    c.drawCentredString(page_width / 2, hy, f"(Branch : {branch_name})")

    # ── CUSTOMER DETAILS ───────────────────────────────────────────────────
    y = page_height - 120
    c.setFont("Helvetica", 8)

    c.drawString(12, y, "Customer Name")
    c.drawString(90, y, ": " + str(order.get("full_name", "—")))
    y -= 11

    c.drawString(12, y, "Mobile No")
    c.drawString(90, y, ": " + str(phone_number))
    y -= 11

    c.drawString(12, y, "Wallet Balance")
    c.drawString(90, y, f": INR {lead_wallet:.2f} /-")
    y -= 11

    c.drawString(12, y, "Invoice No")
    c.drawString(90, y, ": " + invoice_no)
    y -= 11

    c.drawString(12, y, "Invoice Date")
    c.drawString(90, y, ": " + invoice_date)
    y -= 10

    # Separator
    draw_dashed_line(y)

    # ── TABLE HEADERS ──────────────────────────────────────────────────────
    y -= 10
    c.setFont("Helvetica-Bold", 8)
    c.drawString(12, y, "Service &")
    c.drawString(100, y, "Provider")
    c.drawRightString(200, y, "Rate")
    c.drawRightString(224, y, "Dis")
    c.drawRightString(242, y, "Qty")
    c.drawRightString(268, y, "Total")

    y -= 9
    c.drawString(12, y, "Product")
    y -= 4

    draw_dashed_line(y)

    # ── TABLE ROWS ─────────────────────────────────────────────────────────
    y -= 2
    c.setFont("Helvetica", 7.5)
    for it in items:
        name_lines = wrap_text(it.get("name", ""), 18)
        providers = []
        p1 = it.get("service_provider")
        p2 = it.get("service_provider_2")
        if p1: providers.append(employees_map.get(p1, p1))
        if p2: providers.append(employees_map.get(p2, p2))
        for extra_id in it.get("extra_providers", []):
            if extra_id: providers.append(employees_map.get(extra_id, extra_id))
        provider_name = ", ".join(providers) if providers else "—"
        provider_lines = wrap_text(provider_name, 14)

        num_lines = max(len(name_lines), len(provider_lines))
        row_h = num_lines * 9 + 4

        # Draw names
        ny = y - 8
        for line in name_lines:
            c.drawString(12, ny, line)
            ny -= 9
        # Draw providers
        py = y - 8
        for line in provider_lines:
            c.drawString(100, py, line)
            py -= 9

        # Draw values
        price = it.get("price", 0)
        disc = it.get("discount", 0)
        qty = it.get("quantity", 1)
        total_val = it.get("line_total", price * qty)

        c.drawRightString(200, y - 8, f"{price:.2f}")
        c.drawRightString(224, y - 8, f"{disc:.0f}" if disc == int(disc) else f"{disc:.2f}")
        c.drawRightString(242, y - 8, str(qty))
        c.drawRightString(268, y - 8, f"{total_val:.2f}")

        y -= row_h

    # Separator
    draw_dashed_line(y)

    # ── TOTALS & SUMMARY BLOCK ─────────────────────────────────────────────
    # Left Details
    ly = y - 10
    c.setFont("Helvetica", 7.5)
    c.drawString(12, ly, f"Total Qty      : {sum(it.get('quantity', 1) for it in items)}")
    ly -= 11
    c.drawString(12, ly, "Payment Mode :")
    ly -= 10

    pay_method = order.get("payment_method", "Cash")
    pay_lines = wrap_text(pay_method, 16)
    for line in pay_lines:
        c.drawString(12, ly, line)
        ly -= 9

    # Right Details
    ry = y - 10
    def draw_summary_row(label, val_str, bold=False):
        nonlocal ry
        if bold:
            c.setFont("Helvetica-Bold", 7.5)
        else:
            c.setFont("Helvetica", 7.5)
        c.drawRightString(215, ry, label)
        c.drawRightString(268, ry, val_str)
        ry -= 10.5

    draw_summary_row("Total :", f"{subtotal_before_tax_and_disc:.2f}")
    draw_summary_row("Coupon Dis :", "0")
    draw_summary_row("Discount :", f"{point_discount:.2f}")
    draw_summary_row("Tax Type :", "Inclusive" if tax_inclusive else "Exclusive")

    cgst_label = f"CGST({tax_rate * 50:.1f}%) :" if tax_rate > 0 else "CGST(0%) :"
    sgst_label = f"SGST({tax_rate * 50:.1f}%) :" if tax_rate > 0 else "SGST(0%) :"
    draw_summary_row(sgst_label, f"{total_tax / 2:.2f}")
    draw_summary_row(cgst_label, f"{total_tax / 2:.2f}")

    draw_summary_row("Total :", f"{grand_total:.2f}", bold=True)
    draw_summary_row("Advance :", "0.00")
    draw_summary_row("Amount Paid :", f"{total_paid:.2f}")
    draw_summary_row("Amount Due :", f"{amount_due:.2f}")

    # Dashed separator at bottom
    fy = min(ly, ry) - 6
    draw_dashed_line(fy)

    # Footer Centered Note
    fy -= 12
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(page_width / 2, fy, "****THANK YOU. PLEASE VISIT AGAIN****")

    c.save()
    buffer.seek(0)
    return FResponse(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=Eminence_Invoice_{}.pdf".format(order.get("id","")[:8].upper())}
    )


def to_ist_date(ts_str: str) -> str:
    if not ts_str:
        return ""
    try:
        ts_str_clean = ts_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts_str_clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        ist = timezone(timedelta(hours=5, minutes=30))
        dt_ist = dt.astimezone(ist)
        return dt_ist.strftime("%Y-%m-%d")
    except Exception:
        return ts_str[:10]

@api.get("/admin/clients/segmentation")
def get_clients_segmentation(user: dict = Depends(require_employee)):
    # Fetch all employees/stylists to map their IDs to names
    emp_map = {}
    for doc in db.collection("users").stream():
        ud = doc.to_dict()
        uid = ud.get("id")
        name = ud.get("name")
        if uid and name:
            emp_map[uid] = name
    for doc in db.collection("stylists").stream():
        sd = doc.to_dict()
        sid = sd.get("id")
        sname = sd.get("name")
        if sid and sname:
            emp_map[sid] = sname

    # 1. Fetch all orders (only phone and created_at and items)
    orders_docs = db.collection("orders").stream()
    phone_to_orders = {}
    for doc in orders_docs:
        od = doc.to_dict()
        phone = od.get("phone", "")
        if phone:
            phone_clean = "".join(filter(str.isdigit, phone))
            if len(phone_clean) >= 10:
                phone_key = phone_clean[-10:]
                phone_to_orders.setdefault(phone_key, []).append(od)

    # 2. Fetch all leads (clients/customers)
    leads_docs = db.collection("leads").stream()

    segments = {
        "all": [],
        "clients": [],
        "active": [],
        "lapse": [],
        "dormant": [],
        "churn": [],
        "one_time": []
    }

    today_date = datetime.now()

    for doc in leads_docs:
        ld = doc.to_dict()
        phone = ld.get("phone", "")
        phone_clean = "".join(filter(str.isdigit, phone))
        phone_key = phone_clean[-10:] if len(phone_clean) >= 10 else None

        orders = phone_to_orders.get(phone_key, []) if phone_key else []
        orders.sort(key=lambda x: x.get("created_at", ""))

        visit_count = len(orders)
        if visit_count == 0:
            visit_count = ld.get("visit_count", 0) or ld.get("total_visits", 0) or 0

        if visit_count <= 0:
            continue

        first_visit = None
        last_visit = None
        last_service = "—"
        last_service_provider = "—"
        last_bill_amount = 0.0

        if orders:
            first_visit = orders[0].get("created_at", "")[:10]
            latest_order = orders[-1]
            last_visit = latest_order.get("created_at", "")[:10]
            last_bill_amount = latest_order.get("total", 0.0)

            # Find the last service name and provider
            services_items = [it for it in latest_order.get("items", []) if it.get("is_service") or it.get("type") == "service"]
            if services_items:
                last_service = services_items[-1].get("name", "—")
                provider_id = services_items[-1].get("service_provider", "—")
                last_service_provider = emp_map.get(provider_id, provider_id)
            else:
                items = latest_order.get("items", [])
                if items:
                    last_service = items[-1].get("name", "—")
                    provider_id = items[-1].get("service_provider", "—")
                    last_service_provider = emp_map.get(provider_id, provider_id)
        else:
            if ld.get("last_visit_date"):
                last_visit = ld.get("last_visit_date")[:10]
            if ld.get("created_at"):
                first_visit = ld.get("created_at")[:10]

        # Calculate days since last visit
        days_ago = None
        if last_visit:
            try:
                visit_dt = datetime.strptime(last_visit, "%Y-%m-%d")
                days_ago = (today_date - visit_dt).days
            except:
                try:
                    visit_dt = datetime.fromisoformat(last_visit)
                    days_ago = (today_date - visit_dt).days
                except:
                    pass

        # Generate invite code
        name = ld.get("name", "")
        clean_name = "".join(filter(str.isalpha, name)).upper()
        name_prefix = clean_name[:4] if len(clean_name) >= 4 else (clean_name + "XXXX")[:4]
        ld_id = ld.get("id", "")
        id_suffix = ld_id[-4:].upper() if len(ld_id) >= 4 else "0000"
        invite_code = f"{name_prefix}{id_suffix}"

        ld_enriched = {
            "id": ld.get("id"),
            "name": name,
            "phone": phone,
            "invite_code": invite_code,
            "first_visit": first_visit or "—",
            "last_visit": last_visit or "—",
            "last_service": last_service,
            "last_service_provider": last_service_provider,
            "last_bill_amount": last_bill_amount,
            "visit_count": visit_count,
            "days_ago": days_ago,
            "grade": ld.get("grade", "Cold"),
            "branch": ld.get("branch", "Baroda"),
            "source": ld.get("source", "Billing"),
            "gender": ld.get("gender", "—"),
            "points": ld.get("points", 0) or ld.get("reward_points", 0) or 0,
            "email": ld.get("email", "—") or "—",
            "assigned_to": ld.get("assigned_to"),
            "assigned_to_name": ld.get("assigned_to_name", "—") or "—"
        }

        segments["all"].append(ld_enriched)

        if visit_count == 0 or not last_visit or days_ago is None:
            segments["clients"].append(ld_enriched)
        elif visit_count == 1 and days_ago > 30:
            segments["one_time"].append(ld_enriched)
        elif days_ago <= 30:
            segments["active"].append(ld_enriched)
        elif days_ago <= 60:
            segments["lapse"].append(ld_enriched)
        elif days_ago <= 365:
            segments["dormant"].append(ld_enriched)
        else:
            segments["churn"].append(ld_enriched)

    return segments

@api.get("/admin/stats")
def admin_stats(branch: Optional[str] = None, user: dict = Depends(require_admin)):
    if user.get("email", "").lower() != "superadmin@eminence.com":
        branch = user.get("branch")

    # Return from cache if fresh (5-minute TTL)
    cache_key = f"admin_stats_{branch or 'all'}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    users_query = db.collection("users").where("role", "==", "user")
    if branch:
        users_query = users_query.where("branch", "==", branch)
    users_count = users_query.count().get()[0][0].value

    bookings_query = db.collection("bookings")
    if branch:
        bookings_query = bookings_query.where("branch", "==", branch)
    bookings_count = bookings_query.count().get()[0][0].value

    orders_query = db.collection("orders")
    if branch:
        orders_query = orders_query.where("branch", "==", branch)
    orders_count = orders_query.count().get()[0][0].value

    products_query = db.collection("products")
    if branch:
        products_query = products_query.where("branch", "==", branch)
    products_count = products_query.count().get()[0][0].value

    services_count = db.collection("services").count().get()[0][0].value

    # Revenue: use cached running total only for ALL branches
    if not branch:
        rev_doc = db.collection("settings").document("revenue_cache").get()
        if rev_doc.exists:
            revenue = rev_doc.to_dict().get("total", 0.0)
        else:
            o_totals = db.collection("orders").select(["total"]).stream()
            revenue = sum(o.to_dict().get("total", 0) for o in o_totals)
            db.collection("settings").document("revenue_cache").set(
                {"total": revenue, "updated_at": now_iso()}
            )
    else:
        o_totals = db.collection("orders").where("branch", "==", branch).select(["total"]).stream()
        revenue = sum(o.to_dict().get("total", 0) for o in o_totals)

    recent_bookings_query = db.collection("bookings")
    if branch:
        recent_bookings_query = recent_bookings_query.where("branch", "==", branch)
    recent_bookings = [d.to_dict() for d in recent_bookings_query.order_by("created_at", direction="DESCENDING").limit(5).stream()]

    recent_orders_query = db.collection("orders")
    if branch:
        recent_orders_query = recent_orders_query.where("branch", "==", branch)
    recent_orders = [d.to_dict() for d in recent_orders_query.order_by("created_at", direction="DESCENDING").limit(5).stream()]

    # Calculate daily revenues in IST
    ist = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist)
    today = now_ist.strftime("%Y-%m-%d")
    # Use IST midnight as UTC datetimes for proper Firestore range queries
    ist_midnight = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    ist_midnight_utc = ist_midnight.astimezone(timezone.utc)
    ist_end_utc = ist_midnight.replace(hour=23, minute=59, second=59).astimezone(timezone.utc)
    today_start_utc = ist_midnight_utc.strftime("%Y-%m-%dT%H:%M:%S")
    today_end_utc = ist_end_utc.strftime("%Y-%m-%dT%H:%M:%S")
    # Also keep bare IST date strings for manual_sales (stored as date only)
    today_start = f"{today}T00:00:00"
    today_end = f"{today}T23:59:59"

    # 1. CRM Lead Sales for Today
    lead_todays_sales = 0.0
    daily_sales_details = []

    # Query leads updated today — use IST-aligned UTC range.
    # To avoid Firestore composite index requirement (range + equality),
    # fetch by date range only and filter branch in Python.
    try:
        leads_query = db.collection("leads").where("updated_at", ">=", today_start_utc).where("updated_at", "<=", today_end_utc)
        leads_stream = leads_query.stream()
    except Exception:
        # Fallback: scan without date filter if index missing
        leads_query = db.collection("leads")
        if branch:
            leads_query = leads_query.where("branch", "==", branch)
        leads_stream = leads_query.stream()

    for doc in leads_stream:
        l = doc.to_dict()
        # Filter branch in Python to avoid composite index
        if branch and l.get("branch") != branch:
            continue
        for p in l.get("payments", []):
            if isinstance(p, dict):
                if p.get("type") == "token":
                    if l.get("status") not in ["converted", "closed"]:
                        continue
                    ts = None
                    for pay in l.get("payments", []):
                        if pay.get("type") == "closure" and pay.get("timestamp"):
                            ts = pay.get("timestamp")
                            break
                    if not ts:
                        ts = l.get("updated_at") or p.get("timestamp") or ""
                else:
                    ts = p.get("timestamp") or ""

                if to_ist_date(ts) == today:
                    amount = p.get("amount", 0.0)
                    lead_todays_sales += amount
                    daily_sales_details.append({
                        "id": doc.id,
                        "type": "CRM Lead",
                        "name": l.get("name", "Unknown Lead"),
                        "amount": amount,
                        "timestamp": ts,
                        "details": f"Status: {l.get('status')} | Payment: {p.get('type')}"
                    })

    # 2. Manual Sales for Today
    manual_query = db.collection("manual_sales").where("date", ">=", today).where("date", "<=", today)
    if branch:
        manual_query = manual_query.where("branch", "==", branch)
    manual_docs = manual_query.stream()
    manual_todays_sales = 0.0
    for m in manual_docs:
        m_dict = m.to_dict()
        amount = m_dict.get("amount", 0.0)
        manual_todays_sales += amount
        daily_sales_details.append({
            "id": m.id,
            "type": "Manual Sale",
            "name": m_dict.get("client_name") or "Manual Client",
            "amount": amount,
            "timestamp": f"{today}T12:00:00",
            "details": f"Service: {m_dict.get('service_name', 'N/A')} | Staff: {m_dict.get('employee_name', 'N/A')}"
        })

    daily_sales_crm = lead_todays_sales + manual_todays_sales

    # 3. Orders for Today
    daily_services = 0.0
    daily_website_products = 0.0
    daily_salon_products = 0.0
    daily_services_details = []
    daily_website_products_details = []
    daily_salon_products_details = []

    # Use IST-aligned UTC range for orders too; filter branch in Python
    try:
        orders_query_today = db.collection("orders").where("created_at", ">=", today_start_utc).where("created_at", "<=", today_end_utc)
        orders_stream = orders_query_today.stream()
    except Exception:
        orders_query_today = db.collection("orders")
        if branch:
            orders_query_today = orders_query_today.where("branch", "==", branch)
        orders_stream = orders_query_today.stream()

    for doc in orders_stream:
        o = doc.to_dict()
        # Filter branch in Python to avoid composite index requirement
        if branch and o.get("branch") != branch:
            continue
        # Only include orders from today (IST)
        if to_ist_date(o.get("created_at", "")) != today:
            continue
        notes = o.get("notes", "")
        total = o.get("total", 0.0)
        created_at = o.get("created_at", "")

        order_info = {
            "id": doc.id,
            "name": o.get("user_name") or o.get("full_name") or "Guest User",
            "amount": total,
            "timestamp": created_at,
            "details": f"Phone: {o.get('phone') or o.get('user_phone') or 'N/A'} | Items: {len(o.get('items', []))} items",
            "items": o.get("items", []),
            "notes": notes
        }

        if "SERVICE BILLING" in notes or "COMBINED BILLING" in notes:
            daily_services += total
            daily_services_details.append(order_info)
        elif "SALES BILLING" in notes:
            daily_salon_products += total
            daily_salon_products_details.append(order_info)
        else:
            daily_website_products += total
            daily_website_products_details.append(order_info)

    result = {
        "users": users_count,
        "bookings": bookings_count,
        "orders": orders_count,
        "products": products_count,
        "services": services_count,
        "revenue": round(revenue, 2),
        "recent_bookings": recent_bookings,
        "recent_orders": recent_orders,
        "daily_sales": round(daily_sales_crm, 2),
        "daily_services": round(daily_services, 2),
        "daily_website_products": round(daily_website_products, 2),
        "daily_salon_products": round(daily_salon_products, 2),
        "daily_sales_details": daily_sales_details,
        "daily_services_details": daily_services_details,
        "daily_website_products_details": daily_website_products_details,
        "daily_salon_products_details": daily_salon_products_details
    }

    # Cache for 60 seconds (reduced from 5 min so daily stats refresh frequently)
    cache_set(cache_key, result, ttl=60)
    return result


@api.get("/admin/bookings")
def admin_bookings(_: dict = Depends(require_admin)):
    docs = db.collection("bookings").order_by("created_at", direction="DESCENDING").stream()
    return [d.to_dict() for d in docs]


@api.get("/admin/bookings/calendar")
def admin_bookings_calendar(year: int = Query(...), month: int = Query(...), _: dict = Depends(require_admin)):
    prefix = f"{year:04d}-{month:02d}"
    docs = db.collection("bookings") \
        .where("date", ">=", prefix) \
        .where("date", "<", prefix + "\uf8ff").stream()
    items = sorted([d.to_dict() for d in docs], key=lambda x: x.get("time", ""))
    grouped: dict = {}
    for b in items:
        grouped.setdefault(b["date"], []).append(b)
    return {"month": prefix, "days": grouped}


@api.patch("/admin/bookings/{bid}")
def admin_update_booking(bid: str, data: StatusUpdate, _: dict = Depends(require_admin)):
    doc_ref = db.collection("bookings").document(bid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Booking not found")
    doc_ref.update({"status": data.status})
    return {"ok": True}


@api.get("/admin/orders")
def admin_orders(limit: int = 200, branch: Optional[str] = None, user: dict = Depends(require_admin)):
    if user.get("email", "").lower() != "superadmin@eminence.com":
        branch = user.get("branch")

    q = db.collection("orders")
    if branch:
        q = q.where("branch", "==", branch)
    docs = q.order_by("created_at", direction="DESCENDING").limit(limit).stream()
    return [d.to_dict() for d in docs]


@api.patch("/admin/orders/{oid}")
def admin_update_order(oid: str, data: dict, _: dict = Depends(require_admin)):
    doc_ref = db.collection("orders").document(oid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Order not found")
    doc_ref.update(data)
    return {"ok": True}


@api.get("/admin/users")
def admin_users(limit: int = 200, _: dict = Depends(require_admin)):
    docs = db.collection("users").limit(limit).stream()
    items = [d.to_dict() for d in docs]
    for i in items: i.pop("password_hash", None)
    return items


# Admin: Service Reminders CRUD
class ServiceReminderIn(BaseModel):
    service_name: str
    interval_days: int
    message: str
    status: Optional[str] = "active"

@api.get("/admin/service-reminders")
def list_service_reminders(_: dict = Depends(require_admin)):
    docs = db.collection("service_reminders").stream()
    reminders = []
    for d in docs:
        rem_data = d.to_dict()
        rem_data["id"] = d.id
        reminders.append(rem_data)
    return reminders

@api.post("/admin/service-reminders")
def create_service_reminder(data: ServiceReminderIn, _: dict = Depends(require_admin)):
    rid = new_id()
    doc = {
        "id": rid,
        "service_name": data.service_name,
        "interval_days": data.interval_days,
        "message": data.message,
        "status": data.status or "active"
    }
    db.collection("service_reminders").document(rid).set(doc)
    return doc

@api.put("/admin/service-reminders/{rid}")
def update_service_reminder(rid: str, data: ServiceReminderIn, _: dict = Depends(require_admin)):
    update_data = data.model_dump()
    db.collection("service_reminders").document(rid).update(update_data)
    return {"ok": True, "id": rid}

@api.delete("/admin/service-reminders/{rid}")
def delete_service_reminder(rid: str, _: dict = Depends(require_admin)):
    db.collection("service_reminders").document(rid).delete()
    return {"ok": True}


# Admin: services CRUD
@api.post("/admin/services")
def admin_create_service(data: ServiceIn, _: dict = Depends(require_admin)):
    sid = new_id()
    doc = {"id": sid, **data.model_dump(), "created_at": now_iso()}
    db.collection("services").document(sid).set(doc)
    cache_bust("raw_services")
    return doc


@api.patch("/admin/services/{sid}")
def admin_update_service(sid: str, data: dict, _: dict = Depends(require_admin)):
    doc_ref = db.collection("services").document(sid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Service not found")
    allowed = ["name", "category", "description", "price", "duration_min", "image_url",
               "membership_price", "reward_points", "service_for", "hide_on_website"]
    update_data = {k: v for k, v in data.items() if k in allowed}
    if update_data:
        doc_ref.update(update_data)
    cache_bust("raw_services")
    return {"ok": True}


@api.delete("/admin/services/{sid}")
def admin_delete_service(sid: str, _: dict = Depends(require_admin)):
    db.collection("services").document(sid).delete()
    cache_bust("raw_services")
    return {"ok": True}


# Admin: memberships CRUD
@api.get("/memberships")
def list_memberships():
    docs = db.collection("memberships").stream()
    return [d.to_dict() for d in docs]


@api.post("/admin/memberships")
def admin_create_membership(data: MembershipIn, _: dict = Depends(require_admin)):
    mid = new_id()
    doc = {"id": mid, **data.model_dump(), "created_at": now_iso()}
    db.collection("memberships").document(mid).set(doc)
    return doc


@api.patch("/admin/memberships/{mid}")
def admin_update_membership(mid: str, data: dict, _: dict = Depends(require_admin)):
    doc_ref = db.collection("memberships").document(mid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Membership not found")
    allowed = ["name", "price", "duration_days", "reward_points_on_purchase",
               "discount_on_services", "discount_on_services_type",
               "discount_on_products", "discount_on_products_type",
               "discount_on_packages", "discount_on_packages_type",
               "reward_points_boost", "min_reward_points_earned",
               "condition", "min_billed_amount"]
    update_data = {k: v for k, v in data.items() if k in allowed}
    if update_data:
        doc_ref.update(update_data)
    return {"ok": True}


@api.delete("/admin/memberships/{mid}")
def admin_delete_membership(mid: str, _: dict = Depends(require_admin)):
    db.collection("memberships").document(mid).delete()
    return {"ok": True}


# Admin: packages CRUD
@api.get("/packages")
def list_packages():
    docs = db.collection("packages").stream()
    return [d.to_dict() for d in docs]


@api.post("/admin/packages")
def admin_create_package(data: PackageIn, _: dict = Depends(require_admin)):
    pid = new_id()
    doc = {"id": pid, **data.model_dump(), "created_at": now_iso()}
    db.collection("packages").document(pid).set(doc)
    return doc


@api.patch("/admin/packages/{pid}")
def admin_update_package(pid: str, data: dict, _: dict = Depends(require_admin)):
    doc_ref = db.collection("packages").document(pid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Package not found")
    allowed = ["name", "duration_days", "valid_till", "price", "services"]
    update_data = {k: v for k, v in data.items() if k in allowed}
    if update_data:
        doc_ref.update(update_data)
    return {"ok": True}


@api.delete("/admin/packages/{pid}")
def admin_delete_package(pid: str, _: dict = Depends(require_admin)):
    db.collection("packages").document(pid).delete()
    return {"ok": True}


def ensure_category_exists(category_name: str):
    if not category_name:
        return
    category_name = category_name.strip()
    if not category_name:
        return
    existing_cat = db.collection("product_categories").where("name", "==", category_name).limit(1).get()
    if not existing_cat:
        cid = new_id()
        db.collection("product_categories").document(cid).set({
            "id": cid,
            "name": category_name,
            "created_at": now_iso()
        })

@api.get("/admin/product-categories")
def admin_list_product_categories(_: dict = Depends(require_admin)):
    docs = db.collection("product_categories").stream()
    results = [d.to_dict() for d in docs]
    if not results:
        # Seeding fallback: seed the static categories
        default_categories = [
            "Scalp Topper", "Volumizers & Clip Sets", "Side Patches",
            "Streaks - Colored Hair Extensions", "Wigs", "Bangs",
            "Buns", "PonyTail", "Permanent Hair Extensions", "Accessories"
        ]
        results = []
        for name in default_categories:
            cid = new_id()
            doc = {"id": cid, "name": name, "created_at": now_iso()}
            db.collection("product_categories").document(cid).set(doc)
            results.append(doc)
    # Sort results by name alphabetically
    results.sort(key=lambda x: x.get("name", "").lower())
    return results

@api.post("/admin/product-categories")
def admin_create_product_category(data: ProductCategoryIn, _: dict = Depends(require_admin)):
    category_name = data.name.strip()
    if not category_name:
        raise HTTPException(400, "Category name cannot be empty")
    existing_cat = db.collection("product_categories").where("name", "==", category_name).limit(1).get()
    if existing_cat:
        return existing_cat[0].to_dict()
    cid = new_id()
    doc = {"id": cid, "name": category_name, "created_at": now_iso()}
    db.collection("product_categories").document(cid).set(doc)
    return doc

@api.delete("/admin/product-categories/{cid}")
def admin_delete_product_category(cid: str, _: dict = Depends(require_admin)):
    db.collection("product_categories").document(cid).delete()
    return {"ok": True}


# Admin: products CRUD
@api.post("/admin/products")
def admin_create_product(data: ProductIn, user: dict = Depends(require_admin)):
    ensure_category_exists(data.category)
    pid = new_id()
    prod_branch = getattr(data, "branch", None)
    if user.get("email", "").lower() != "superadmin@eminence.com":
        prod_branch = user.get("branch") or "Baroda"
    elif not prod_branch:
        prod_branch = "Baroda"

    doc = {"id": pid, **data.model_dump(), "branch": prod_branch, "created_at": now_iso()}
    db.collection("products").document(pid).set(doc)
    cache_bust("raw_products")
    return doc


@api.patch("/admin/products/{pid}")
def admin_update_product(pid: str, data: ProductIn, user: dict = Depends(require_admin)):
    ensure_category_exists(data.category)
    doc_ref = db.collection("products").document(pid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Product not found")

    prod_branch = getattr(data, "branch", None)
    if user.get("email", "").lower() != "superadmin@eminence.com":
        prod_branch = user.get("branch") or "Baroda"
    elif not prod_branch:
        prod_branch = "Baroda"

    update_dict = data.model_dump()
    update_dict["branch"] = prod_branch
    doc_ref.update(update_dict)
    cache_bust("raw_products")
    return {"ok": True}


@api.delete("/admin/products/{pid}")
def admin_delete_product(pid: str, _: dict = Depends(require_admin)):
    db.collection("products").document(pid).delete()
    cache_bust("raw_products")
    return {"ok": True}


# ── Product Usage in Salon ──────────────────────────────────────────────────

class ProductUseIn(BaseModel):
    product_id: str
    quantity: int
    employee_id: str
    employee_name: str
    remarks: Optional[str] = ""

class ProductAddStockIn(BaseModel):
    product_id: str
    quantity: int
    vendor_id: str
    vendor_name: str
    invoice_no: Optional[str] = ""
    cost_price: float
    selling_price: float
    expiry_date: Optional[str] = ""
    remarks: Optional[str] = ""
    amount_paid: Optional[float] = 0.0
    payment_mode: Optional[str] = "Cash"
    payment_status: Optional[str] = "Pending"
    discount: Optional[float] = 0.0
    branch: Optional[str] = None

class UpdateStockLogPaymentIn(BaseModel):
    amount_paid: float
    payment_mode: str
    payment_status: str


@api.get("/admin/products/usages")
def admin_list_usages(branch: Optional[str] = None, user: dict = Depends(require_admin)):
    if user.get("email", "").lower() != "superadmin@eminence.com":
        branch = user.get("branch")

    q = db.collection("product_usages")
    if branch:
        q = q.where("branch", "==", branch)
    docs = q.stream()
    results = [d.to_dict() for d in docs]
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results


@api.post("/admin/products/use")
def admin_use_product(data: ProductUseIn, admin_user: dict = Depends(require_admin)):
    prod_ref = db.collection("products").document(data.product_id)
    prod_snap = prod_ref.get()
    if not prod_snap.exists:
        raise HTTPException(404, "Product not found")
    prod = prod_snap.to_dict()
    current_stock = prod.get("stock", 0)
    
    target_branch = admin_user.get("branch") or prod.get("branch") or "Baroda"
    b_stock = prod.get("branch_stock", {})
    
    if not b_stock:
        b_stock[prod.get("branch", "Baroda")] = current_stock
        
    current_b_stock = b_stock.get(target_branch, 0)
    
    if current_b_stock < data.quantity:
        raise HTTPException(400, f"Insufficient stock at {target_branch}. Available: {current_b_stock}")

    b_stock[target_branch] = current_b_stock - data.quantity

    # Deduct stock
    prod_ref.update({
        "stock": current_stock - data.quantity,
        "branch_stock": b_stock
    })
    cache_bust("raw_products")

    # Log usage
    uid = new_id()
    doc = {
        "id": uid,
        **data.model_dump(),
        "product_name": prod.get("name", "Unknown Product"),
        "branch": target_branch,
        "created_at": now_iso()
    }
    db.collection("product_usages").document(uid).set(doc)
    cache_bust("raw_products")
    return doc


@api.patch("/admin/products/use/{uid}")
def admin_update_product_usage(uid: str, data: dict, _: dict = Depends(require_admin)):
    doc_ref = db.collection("product_usages").document(uid)
    doc_snap = doc_ref.get()
    if not doc_snap.exists:
        raise HTTPException(404, "Usage record not found")

    old_data = doc_snap.to_dict()
    product_id = old_data.get("product_id")
    old_qty = old_data.get("quantity", 0)

    new_qty = data.get("quantity")
    if new_qty is not None:
        new_qty = int(new_qty)
        qty_diff = new_qty - old_qty

        prod_ref = db.collection("products").document(product_id)
        prod_snap = prod_ref.get()
        if not prod_snap.exists:
            raise HTTPException(404, "Product not found")
        prod = prod_snap.to_dict()
        current_stock = prod.get("stock", 0)

        if current_stock < qty_diff:
            raise HTTPException(400, f"Insufficient stock. Available: {current_stock}")

        prod_ref.update({"stock": current_stock - qty_diff})
        cache_bust("raw_products")

    payload = {k: v for k, v in data.items() if k not in ["id", "product_id", "product_name", "created_at"]}
    doc_ref.update(payload)
    return {"status": "success", "id": uid}


def sync_stock_log_expense(log_doc: dict):
    lid = log_doc.get("id")
    amount_paid = log_doc.get("amount_paid", 0.0)
    
    if amount_paid <= 0:
        db.collection("expenses").document(lid).delete()
    else:
        created_at = log_doc.get("created_at", "")
        date_str = created_at[:10] if len(created_at) >= 10 else now_iso()[:10]
        
        expense_doc = {
            "id": lid,
            "category": "Supplies",
            "amount": amount_paid,
            "date": date_str,
            "description": f"Vendor Purchase: {log_doc.get('vendor_name', '—')} (Invoice: {log_doc.get('invoice_no', '—')}) - {log_doc.get('product_name', 'Unknown Product')} x {log_doc.get('quantity', 0)}",
            "paid_to": log_doc.get("vendor_name", ""),
            "payment_mode": log_doc.get("payment_mode", "Cash"),
            "branch": log_doc.get("branch") or "Baroda",
            "created_at": created_at or now_iso()
        }
        db.collection("expenses").document(lid).set(expense_doc)


@api.post("/admin/products/add-stock")
def admin_add_product_stock(data: ProductAddStockIn, _: dict = Depends(require_admin)):
    prod_ref = db.collection("products").document(data.product_id)
    prod_snap = prod_ref.get()
    if not prod_snap.exists:
        raise HTTPException(404, "Product not found")
    prod = prod_snap.to_dict()
    current_stock = prod.get("stock", 0)
    
    b_stock = prod.get("branch_stock", {})
    target_branch = data.branch or prod.get("branch") or "Baroda"
    
    if not b_stock:
        b_stock[prod.get("branch", "Baroda")] = current_stock
        
    current_b_stock = b_stock.get(target_branch, 0)
    b_stock[target_branch] = current_b_stock + data.quantity

    update_data = {
        "stock": current_stock + data.quantity,
        "branch_stock": b_stock,
        "price": data.selling_price
    }
    if data.branch:
        update_data["branch"] = data.branch

    # Increment stock and update selling price
    prod_ref.update(update_data)
    cache_bust("raw_products")
    
    # Log stock addition
    lid = new_id()
    doc = {
        "id": lid,
        **data.model_dump(),
        "product_name": prod.get("name", "Unknown Product"),
        "branch": data.branch or prod.get("branch") or "Baroda",
        "created_at": now_iso()
    }
    db.collection("stock_logs").document(lid).set(doc)
    sync_stock_log_expense(doc)
    return doc


# Admin: Expenses CRUD
class ExpenseIn(BaseModel):
    category: str
    amount: float
    date: str
    description: Optional[str] = ""
    paid_to: Optional[str] = ""
    payment_mode: Optional[str] = "Cash"

@api.get("/admin/expenses")
def admin_list_expenses(branch: Optional[str] = None, user: dict = Depends(require_admin)):
    if user.get("email", "").lower() != "superadmin@eminence.com":
        branch = user.get("branch")

    docs = db.collection("expenses").stream()
    results = [d.to_dict() for d in docs]
    if branch:
        # Include expenses matching this branch OR legacy expenses with no branch tag
        results = [e for e in results if not e.get("branch") or e.get("branch") == branch]
    results.sort(key=lambda x: x.get("date", ""), reverse=True)
    return results


@api.post("/admin/expenses")
def admin_create_expense(data: ExpenseIn, admin: dict = Depends(require_admin)):
    eid = new_id()
    doc = {"id": eid, **data.model_dump(), "paid_by": admin.get("name", "Admin"), "branch": admin.get("branch", ""), "created_at": now_iso()}
    db.collection("expenses").document(eid).set(doc)
    return doc

@api.put("/admin/expenses/{eid}")
def admin_update_expense(eid: str, data: ExpenseIn, _: dict = Depends(require_admin)):
    update_data = data.model_dump()
    db.collection("expenses").document(eid).update(update_data)
    return {"ok": True, "id": eid}

@api.delete("/admin/expenses/{eid}")
def admin_delete_expense(eid: str, _: dict = Depends(require_admin)):
    db.collection("expenses").document(eid).delete()
    return {"ok": True}


# Admin: Expense Categories CRUD
@api.get("/admin/expense-categories")
def list_expense_categories(_: dict = Depends(require_admin)):
    docs = db.collection("expense_categories").stream()
    categories = [d.to_dict().get("name") for d in docs]
    if not categories:
        defaults = ["Rent", "Supplies", "Tea & Snacks", "Electricity", "Marketing", "Salaries", "Maintenance", "DMT", "Purchase Salon", "Utility", "Other"]
        for d in defaults:
            db.collection("expense_categories").document(d).set({"name": d})
        categories = defaults
    categories.sort()
    return categories

class ExpenseCategoryIn(BaseModel):
    name: str

@api.post("/admin/expense-categories")
def create_expense_category(data: ExpenseCategoryIn, _: dict = Depends(require_admin)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    db.collection("expense_categories").document(name).set({"name": name})
    return {"name": name}

@api.delete("/admin/expense-categories/{name}")
def delete_expense_category(name: str, _: dict = Depends(require_admin)):
    db.collection("expense_categories").document(name).delete()
    return {"ok": True}


@api.get("/admin/products/stock-logs")
def admin_list_stock_logs(branch: Optional[str] = None, user: dict = Depends(require_admin)):
    if user.get("email", "").lower() != "superadmin@eminence.com":
        branch = user.get("branch")

    q = db.collection("stock_logs")
    if branch:
        q = q.where("branch", "==", branch)
    docs = q.stream()
    results = [d.to_dict() for d in docs]
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results


@api.get("/admin/products/transfers")
def admin_list_transfers(_: dict = Depends(require_admin)):
    docs = db.collection("product_transfers").stream()
    results = [d.to_dict() for d in docs]
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results


@api.post("/admin/products/transfer")
def admin_transfer_product(data: ProductTransferIn, _: dict = Depends(require_admin)):
    # 1. Deduct stock from source branch product
    prod_ref = db.collection("products").document(data.product_id)
    prod_snap = prod_ref.get()
    if not prod_snap.exists:
        raise HTTPException(404, "Source product not found")
    prod = prod_snap.to_dict()
    current_stock = prod.get("stock", 0)
    if current_stock < data.quantity:
        raise HTTPException(400, f"Insufficient stock at source branch. Available: {current_stock}")
    
    prod_ref.update({"stock": current_stock - data.quantity})
    
    # 2. Add stock to destination branch product
    dest_query = db.collection("products").where("name", "==", prod.get("name")).where("branch", "==", data.destination).limit(1).get()
    if dest_query:
        dest_prod_ref = dest_query[0].reference
        dest_prod = dest_query[0].to_dict()
        dest_prod_ref.update({"stock": dest_prod.get("stock", 0) + data.quantity})
    else:
        new_pid = new_id()
        new_prod = {
            **prod,
            "id": new_pid,
            "stock": data.quantity,
            "branch": data.destination,
            "created_at": now_iso()
        }
        db.collection("products").document(new_pid).set(new_prod)
        
    # 3. Log transfer
    tid = new_id()
    doc = {
        "id": tid,
        **data.model_dump(),
        "product_name": prod.get("name", "Unknown Product"),
        "created_at": now_iso()
    }
    db.collection("product_transfers").document(tid).set(doc)
    cache_bust("raw_products")
    return doc


@api.patch("/admin/stock-logs/{lid}/payment")
def admin_update_stock_log_payment(lid: str, data: UpdateStockLogPaymentIn, _: dict = Depends(require_admin)):
    log_ref = db.collection("stock_logs").document(lid)
    log_snap = log_ref.get()
    if not log_snap.exists:
        raise HTTPException(404, "Stock log not found")
    
    log_ref.update({
        "amount_paid": data.amount_paid,
        "payment_mode": data.payment_mode,
        "payment_status": data.payment_status
    })
    
    updated_snap = log_ref.get()
    if updated_snap.exists:
        sync_stock_log_expense(updated_snap.to_dict())
        
    return {"status": "success"}


@api.get("/admin/products/{pid}/history")
def admin_product_history(pid: str, _: dict = Depends(require_admin)):
    prod_snap = db.collection("products").document(pid).get()
    if not prod_snap.exists:
        raise HTTPException(404, "Product not found")
    prod = prod_snap.to_dict()
    
    history = []
    
    # 1. Fetch stock additions
    stock_docs = db.collection("stock_logs").where("product_id", "==", pid).stream()
    for doc in stock_docs:
        d = doc.to_dict()
        history.append({
            "id": d.get("id"),
            "event_type": "stock_addition",
            "quantity": d.get("quantity", 0),
            "created_at": d.get("created_at"),
            "details": f"Added stock from Vendor: {d.get('vendor_name', '—')} (Invoice: {d.get('invoice_no', '—')}) at Cost Price: ₹{d.get('cost_price', 0)} and Selling Price: ₹{d.get('selling_price', 0)}.",
            "employee_name": "Admin",
            "remarks": d.get("remarks", "")
        })
        
    # 2. Fetch salon usages
    usage_docs = db.collection("product_usages").where("product_id", "==", pid).stream()
    for doc in usage_docs:
        d = doc.to_dict()
        history.append({
            "id": d.get("id"),
            "event_type": "usage",
            "quantity": d.get("quantity", 0),
            "created_at": d.get("created_at"),
            "details": "Used in salon.",
            "employee_name": d.get("employee_name", "—"),
            "remarks": d.get("remarks", "")
        })
        
    # 3. Fetch product transfers
    transfer_docs = db.collection("product_transfers").where("product_id", "==", pid).stream()
    for doc in transfer_docs:
        d = doc.to_dict()
        history.append({
            "id": d.get("id"),
            "event_type": "transfer",
            "quantity": d.get("quantity", 0),
            "created_at": d.get("created_at"),
            "details": f"Transferred from {d.get('source', '—')} to {d.get('destination', '—')}.",
            "employee_name": d.get("employee_name", "—"),
            "remarks": d.get("remarks", "")
        })
        
    # 4. Fetch orders/sales
    order_docs = db.collection("orders").stream()
    for doc in order_docs:
        d = doc.to_dict()
        for item in d.get("items", []):
            if item.get("product_id") == pid:
                history.append({
                    "id": d.get("id"),
                    "event_type": "sale",
                    "quantity": item.get("quantity", 0),
                    "created_at": d.get("created_at"),
                    "details": f"Sold to customer {d.get('full_name', '—')} (Phone: {d.get('phone', '—')}) via Invoice #{d.get('id', '')[:8].upper()}.",
                    "employee_name": d.get("employee_name") or d.get("user_name") or "—",
                    "remarks": d.get("notes", "")
                })
                
    # Sort history descending by created_at
    history.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {
        "product": {
            "id": pid,
            "name": prod.get("name", ""),
            "stock": prod.get("stock", 0),
            "price": prod.get("price", 0)
        },
        "history": history
    }


@api.get("/admin/vendors/{vid}/history")
def admin_vendor_history(vid: str, _: dict = Depends(require_admin)):
    vendor_snap = db.collection("vendors").document(vid).get()
    if not vendor_snap.exists:
        raise HTTPException(404, "Vendor not found")
    vendor = vendor_snap.to_dict()
    
    # Fetch all stock additions from this vendor
    stock_docs = db.collection("stock_logs").where("vendor_id", "==", vid).stream()
    history = []
    total_spent = 0.0
    total_paid = 0.0
    total_pending = 0.0
    total_qty = 0
    
    for doc in stock_docs:
        d = doc.to_dict()
        qty = d.get("quantity", 0)
        cost = d.get("cost_price", 0.0)
        total_cost = qty * cost
        amount_paid = d.get("amount_paid", 0.0)
        discount = d.get("discount", 0.0)
        pending = max(0, round(total_cost - discount - amount_paid, 2))
        total_spent += total_cost
        total_paid += amount_paid
        total_pending += pending
        total_qty += qty
        
        history.append({
            "id": d.get("id"),
            "product_id": d.get("product_id"),
            "product_name": d.get("product_name", "Unknown Product"),
            "quantity": qty,
            "cost_price": cost,
            "selling_price": d.get("selling_price", 0.0),
            "total_cost": round(total_cost, 2),
            "amount_paid": round(amount_paid, 2),
            "discount": round(discount, 2),
            "pending_amount": pending,
            "payment_mode": d.get("payment_mode", "—"),
            "payment_status": d.get("payment_status", "Pending"),
            "invoice_no": d.get("invoice_no", ""),
            "created_at": d.get("created_at"),
            "remarks": d.get("remarks", "")
        })
        
    history.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {
        "vendor": {
            "id": vid,
            "name": vendor.get("name", ""),
            "contact_person": vendor.get("contact_person", "")
        },
        "total_purchased_amount": round(total_spent, 2),
        "total_paid_amount": round(total_paid, 2),
        "total_pending_amount": round(total_pending, 2),
        "total_purchased_quantity": total_qty,
        "history": history
    }


# Admin: Vendors CRUD
@api.get("/admin/vendors")
def admin_list_vendors(_: dict = Depends(require_admin)):
    docs = db.collection("vendors").stream()
    return [d.to_dict() for d in docs]

@api.post("/admin/vendors")
def admin_create_vendor(data: VendorIn, _: dict = Depends(require_admin)):
    vid = new_id()
    doc = {"id": vid, **data.model_dump(), "created_at": now_iso()}
    db.collection("vendors").document(vid).set(doc)
    return doc

@api.patch("/admin/vendors/{vid}")
def admin_update_vendor(vid: str, data: dict, _: dict = Depends(require_admin)):
    db.collection("vendors").document(vid).update(data)
    return {"ok": True}

@api.delete("/admin/vendors/{vid}")
def admin_delete_vendor(vid: str, _: dict = Depends(require_admin)):
    db.collection("vendors").document(vid).delete()
    return {"ok": True}


# Admin: Salon Products CRUD
@api.get("/admin/salon-products")
def admin_list_salon_products(_: dict = Depends(require_admin)):
    docs = db.collection("salon_products").stream()
    results = [d.to_dict() for d in docs]
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results

@api.post("/admin/salon-products")
def admin_create_salon_product(data: SalonProductIn, _: dict = Depends(require_admin)):
    pid = new_id()
    doc = {
        "id": pid,
        **data.model_dump(),
        "created_at": now_iso()
    }
    db.collection("salon_products").document(pid).set(doc)
    return doc

@api.patch("/admin/salon-products/{pid}")
def admin_update_salon_product(pid: str, data: SalonProductIn, _: dict = Depends(require_admin)):
    db.collection("salon_products").document(pid).update(data.model_dump())
    return {"ok": True}

@api.delete("/admin/salon-products/{pid}")
def admin_delete_salon_product(pid: str, _: dict = Depends(require_admin)):
    db.collection("salon_products").document(pid).delete()
    return {"ok": True}


# ----- Consultations (Enquiries) -----
@api.post("/consultations")
def create_consultation(data: ConsultationIn):
    cid = new_id()
    doc = {
        "id": cid,
        **data.model_dump(),
        "status": "new",
        "created_at": now_iso()
    }
    db.collection("consultations").document(cid).set(doc)
    return doc


@api.get("/admin/consultations")
def admin_list_consultations(_: dict = Depends(require_admin)):
    docs = db.collection("consultations").order_by("created_at", direction="DESCENDING").stream()
    return [d.to_dict() for d in docs]


@api.get("/consultation-media")
def get_consultation_media():
    doc = db.collection("settings").document("consultation_media").get()
    if doc.exists:
        data = doc.to_dict()
        if "gallery" not in data:
            data["gallery"] = []
        if "before_after" not in data:
            old_images = data.get("images", [])
            old_videos = data.get("videos", [])
            data = {
                "before_after": {
                    "images": old_images[:3] if len(old_images) >= 3 else old_images,
                    "videos": old_videos[:2] if len(old_videos) >= 2 else old_videos
                },
                "client_reviews": {
                    "images": old_images[3:] if len(old_images) >= 3 else [],
                    "videos": old_videos[2:] if len(old_videos) >= 2 else []
                }
            }
        return data
    return {
        "before_after": {
            "images": [
                "/consultancy/image1.jpeg",
                "/consultancy/image2.jpeg",
                "/consultancy/image3.jpeg",
            ],
            "videos": [
                "/consultancy/video1.mp4",
                "/consultancy/video2.mp4",
            ]
        },
        "client_reviews": {
            "images": [
                "/consultancy/image4.jpeg",
                "/consultancy/image5.jpeg",
            ],
            "videos": [
                "/consultancy/video3.mp4",
                "/consultancy/video4.mp4",
            ]
        }
    }


@api.post("/admin/consultation-media")
def update_consultation_media(data: dict, user: dict = Depends(require_admin)):
    db.collection("settings").document("consultation_media").set({
        "gallery": data.get("gallery", []),
        "before_after": data.get("before_after", {"images": [], "videos": []}),
        "client_reviews": data.get("client_reviews", {"images": [], "videos": []}),
        "updated_at": now_iso(),
        "updated_by": user["id"]
    })
    return {"ok": True}


@api.get("/maintenance")
def get_maintenance_status():
    doc = db.collection("settings").document("maintenance").get()
    if doc.exists:
        return doc.to_dict()
    return {"enabled": False}


@api.post("/admin/maintenance")
def update_maintenance_status(data: dict, user: dict = Depends(require_admin)):
    enabled = data.get("enabled", False)
    db.collection("settings").document("maintenance").set({
        "enabled": enabled,
        "updated_at": now_iso(),
        "updated_by": user["id"]
    })
    return {"ok": True}


# ----- Admin Permissions (Super Admin configures what admins can access) -----
@api.get("/admin/permissions")
def get_admin_permissions(_: dict = Depends(require_admin)):
    """Returns the list of tab keys that regular admins are allowed to access.
    '__ALL__' means all tabs are accessible (default)."""
    doc = db.collection("settings").document("admin_permissions").get()
    if doc.exists:
        return doc.to_dict()
    return {"allowed_tabs": "__ALL__"}


@api.post("/admin/permissions")
def set_admin_permissions(data: dict, user: dict = Depends(require_admin)):
    """Only the Super Admin (identified by email) may configure admin permissions."""
    if user.get("email", "").lower() != "superadmin@eminence.com":
        raise HTTPException(403, "Only Super Admin can modify access permissions")
    allowed_tabs = data.get("allowed_tabs", "__ALL__")
    db.collection("settings").document("admin_permissions").set({
        "allowed_tabs": allowed_tabs,
        "updated_at": now_iso(),
        "updated_by": user["id"]
    })
    return {"ok": True}


@api.get("/admin/branches")
def get_branches(_: dict = Depends(require_admin)):
    docs = db.collection("branches").stream()
    results = [d.to_dict() for d in docs]
    
    if not results:
        # Seed Surat and Baroda
        default_branches = ["Surat", "Baroda"]
        for b_name in default_branches:
            b_id = b_name.lower()
            email = f"admin_{b_id}@eminence.com"
            password = f"{b_name}@123"
            
            # check if user already exists
            user_docs = db.collection("users").where("email", "==", email).limit(1).get()
            if not user_docs:
                uid = new_id()
                db.collection("users").document(uid).set({
                    "id": uid,
                    "name": f"Admin {b_name}",
                    "email": email,
                    "password_hash": hash_password(password),
                    "phone": "",
                    "role": "admin",
                    "branch": b_name,
                    "created_at": now_iso()
                })
            
            # save in branches collection
            db.collection("branches").document(b_id).set({
                "id": b_id,
                "name": b_name,
                "admin_email": email,
                "admin_password": password,
                "created_at": now_iso()
            })
            
        # Re-read
        docs = db.collection("branches").stream()
        results = [d.to_dict() for d in docs]
        
    return results


@api.post("/admin/branches")
def create_branch(data: BranchIn, _: dict = Depends(require_admin)):
    b_name = data.name.strip()
    if not b_name:
        raise HTTPException(400, "Branch name cannot be empty")
        
    # Check if branch already exists
    b_id = "".join(c for c in b_name.lower() if c.isalnum() or c == "_")
    if not b_id:
        b_id = str(uuid.uuid4())[:8]
        
    existing = db.collection("branches").document(b_id).get()
    if existing.exists:
        raise HTTPException(400, "Branch already exists")
        
    email = f"admin_{b_id}@eminence.com"
    
    # Generate unique random password
    import string
    import random
    chars = string.ascii_letters + string.digits
    password = "".join(random.choice(chars) for _ in range(8))
    
    # Create corresponding admin user in "users" collection
    uid = new_id()
    db.collection("users").document(uid).set({
        "id": uid,
        "name": f"Admin {b_name}",
        "email": email,
        "password_hash": hash_password(password),
        "phone": "",
        "role": "admin",
        "branch": b_name,
        "created_at": now_iso()
    })
    
    doc = {
        "id": b_id,
        "name": b_name,
        "admin_email": email,
        "admin_password": password,
        "created_at": now_iso()
    }
    db.collection("branches").document(b_id).set(doc)
    return doc



# ----- Image Upload (admin) -----
ALLOWED_MEDIA = {
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/ogg", "application/octet-stream"
}
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".ogg"}


@api.post("/admin/upload")
async def admin_upload(file: UploadFile = File(...), user: dict = Depends(require_admin)):
    filename = file.filename or "upload"
    ext = ""
    if "." in filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower()

    content_type = file.content_type or ""
    # Try to guess content type from extension if browser didn't send one
    if not content_type or content_type == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(filename)
        if guessed:
            content_type = guessed

    if content_type not in ALLOWED_MEDIA and ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type: {content_type or ext}")

    data = await file.read()
    max_size = 20 * 1024 * 1024  # 20 MB
    if len(data) > max_size:
        raise HTTPException(400, f"File too large (max 20 MB). Got {len(data)//1024//1024} MB")

    safe_name = f"{new_id()}{ext}"
    dest = UPLOADS_DIR / safe_name
    dest.write_bytes(data)

    fid = new_id()
    stored_path = safe_name
    db.collection("files").document(fid).set({
        "id": fid,
        "storage_path": stored_path,
        "original_filename": filename,
        "content_type": content_type,
        "size": len(data),
        "uploaded_by": user["id"],
        "is_deleted": False,
        "created_at": now_iso(),
    })
    logger.info(f"Saved upload: {stored_path} ({len(data)} bytes) by {user.get('email')}")
    return {"path": stored_path, "url": f"/api/files/{stored_path}"}


# ----- Receptionist Booking Manager -----
@api.get("/receptionist/users")
def receptionist_list_users(_: dict = Depends(require_receptionist)):
    docs = db.collection("users").where("role", "==", "user").stream()
    return [d.to_dict() for d in docs]


@api.get("/receptionist/bookings")
def receptionist_list_bookings(_: dict = Depends(require_receptionist)):
    docs = db.collection("bookings").stream()
    items = [d.to_dict() for d in docs]
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


class ReceptionistBookingIn(BaseModel):
    user_id: Optional[str] = None
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = ""
    service_id: str
    stylist_id: Optional[str] = None
    date: str
    time: str
    notes: Optional[str] = ""


@api.post("/receptionist/bookings")
def receptionist_create_booking(data: ReceptionistBookingIn, _: dict = Depends(require_receptionist)):
    service_doc = db.collection("services").document(data.service_id).get()
    if not service_doc.exists:
        raise HTTPException(404, "Service not found")
    service = service_doc.to_dict()
    
    stylist = None
    if data.stylist_id:
        stylist_doc = db.collection("stylists").document(data.stylist_id).get()
        if stylist_doc.exists:
            stylist = stylist_doc.to_dict()
        else:
            emp_doc = db.collection("users").document(data.stylist_id).get()
            if emp_doc.exists:
                emp = emp_doc.to_dict()
                stylist = {"id": emp["id"], "name": emp["name"]}
            else:
                raise HTTPException(404, "Stylist/Employee not found")

    bid = new_id()
    booking = {
        "id": bid,
        "user_id": data.user_id or f"walkin_{new_id()[:8]}",
        "user_name": data.customer_name,
        "user_email": data.customer_email or "",
        "user_phone": data.customer_phone,
        "service_id": service["id"],
        "service_name": service["name"],
        "service_price": service["price"],
        "stylist_id": stylist["id"] if stylist else None,
        "stylist_name": stylist["name"] if stylist else "Any available",
        "date": data.date,
        "time": data.time,
        "notes": data.notes or "",
        "status": "confirmed",
        "created_at": now_iso(),
    }
    db.collection("bookings").document(bid).set(booking)
    return booking


class AssignStylistIn(BaseModel):
    stylist_id: Optional[str] = None


@api.patch("/receptionist/bookings/{bid}/assign")
def receptionist_assign_stylist(bid: str, data: AssignStylistIn, _: dict = Depends(require_receptionist)):
    doc_ref = db.collection("bookings").document(bid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Booking not found")
    
    stylist_name = "Any available"
    if data.stylist_id:
        stylist_doc = db.collection("stylists").document(data.stylist_id).get()
        if stylist_doc.exists:
            stylist_name = stylist_doc.to_dict().get("name", "")
        else:
            emp_doc = db.collection("users").document(data.stylist_id).get()
            if emp_doc.exists:
                stylist_name = emp_doc.to_dict().get("name", "")
            else:
                raise HTTPException(404, "Stylist/Employee not found")
                
    doc_ref.update({
        "stylist_id": data.stylist_id,
        "stylist_name": stylist_name
    })
    return {"ok": True}


@api.get("/files/{filename:path}")
def serve_file(filename: str):
    """Serve locally stored files. Tries multiple path formats for backward compat."""
    raw = filename.lstrip("/")

    # Strategy 1: new flat format — just the UUID filename (e.g. "abc-123.jpg")
    candidate1 = UPLOADS_DIR / raw
    # Strategy 2: old format with slashes replaced by underscores
    candidate2 = UPLOADS_DIR / raw.replace("/", "_")
    # Strategy 3: try the last segment only (UUID.ext)
    candidate3 = UPLOADS_DIR / raw.split("/")[-1]

    for candidate in [candidate1, candidate2, candidate3]:
        if candidate.exists():
            media_type, _ = mimetypes.guess_type(candidate.name)
            return FileResponse(str(candidate), media_type=media_type or "application/octet-stream")

    raise HTTPException(404, f"File not found: {raw}")


@api.get("/")
async def root():
    return {"app": "Eminence Salon API", "city": "Vadodara"}


# ----- Employees -----
@api.get("/admin/employees")
def list_employees(user: dict = Depends(require_employee)):
    docs = db.collection("users").where("role", "in", ["employee", "sales", "service", "receptionist"]).stream()
    items = [d.to_dict() for d in docs]
    for i in items: i.pop("password_hash", None)
    return items


@api.get("/admin/reports")
def admin_reports(month: Optional[str] = Query(None), branch: Optional[str] = None, user: dict = Depends(require_admin)):
    if user.get("email", "").lower() != "superadmin@eminence.com":
        branch = user.get("branch")
        
    filter_val = month if month else now_iso()[:7]
    month_prefix = filter_val[:7]
    
    start_str = month_prefix
    end_str = month_prefix + "-31T23:59:59"
    
    # 1. Fetch manual sales
    m_query = db.collection("manual_sales").where("date", ">=", start_str).where("date", "<=", end_str)
    if branch:
        m_query = m_query.where("branch", "==", branch)
    manual_sales = [d.to_dict() for d in m_query.stream()]
    
    # 2. Fetch employees
    emp_query = db.collection("users").where("role", "in", ["employee", "sales", "service"])
    if branch:
        emp_query = emp_query.where("branch", "==", branch)
    employees = [d.to_dict() for d in emp_query.stream()]
    
    leads_query = db.collection("leads")
    if branch:
        leads_query = leads_query.where("branch", "==", branch)
    leads_docs = leads_query.select(["assigned_to", "payments", "status", "created_at", "updated_at", "branch", "section"]).stream()
    
    leads_by_emp = {}
    all_payments = []
    
    for doc in leads_docs:
        d = doc.to_dict()
        emp_id = d.get("assigned_to")
        
        # Group leads created in the current month
        created_at = d.get("created_at", "")
        if created_at.startswith(month_prefix) and emp_id:
            leads_by_emp.setdefault(emp_id, []).append(d)
            
        payments = d.get("payments", [])
        for p in payments:
            if isinstance(p, dict):
                if p.get("type") == "token":
                    if d.get("status") not in ["converted", "closed"]:
                        continue
                    ts = None
                    for pay in payments:
                        if pay.get("type") == "closure" and pay.get("timestamp"):
                            ts = pay.get("timestamp")
                            break
                    if not ts:
                        ts = d.get("updated_at") or p.get("timestamp") or ""
                else:
                    ts = p.get("timestamp") or ""
                
                p_copy = p.copy()
                p_copy["timestamp"] = ts
                p_copy["recorded_by_id"] = emp_id
                all_payments.append(p_copy)
                
    # 4. Stream calls for the current month only and aggregate in memory
    calls_docs = db.collection("calls").where("timestamp", ">=", start_str).where("timestamp", "<=", end_str).select(["user_id", "timestamp"]).stream()
    calls_by_emp = {}
    for doc in calls_docs:
        d = doc.to_dict()
        uid = d.get("user_id")
        if uid:
            calls_by_emp[uid] = calls_by_emp.get(uid, 0) + 1
            
    reports = []
    for emp in employees:
        emp_id = emp["id"]
        # Filter both payments and manual sales by the provided prefix (YYYY-MM or YYYY-MM-DD)
        emp_payments = [p for p in all_payments if p.get("recorded_by_id") == emp_id and p.get("timestamp", "").startswith(filter_val)]
        emp_manual = [s for s in manual_sales if s.get("employee_id") == emp_id and s.get("date", "").startswith(filter_val)]
        
        # Monthly total for the whole month (to calculate conversion/target)
        month_payments = [p for p in all_payments if p.get("recorded_by_id") == emp_id and p.get("timestamp", "").startswith(month_prefix)]
        month_manual = [s for s in manual_sales if s.get("employee_id") == emp_id and s.get("date", "").startswith(month_prefix)]
        
        total_sales = sum(p.get("amount", 0) for p in emp_payments) + sum(s.get("amount", 0) for s in emp_manual)
        month_total = sum(p.get("amount", 0) for p in month_payments) + sum(s.get("amount", 0) for s in month_manual)
        
        # Performance calculation (optimized from memory cache)
        month_leads = leads_by_emp.get(emp_id, [])
        total_calls = calls_by_emp.get(emp_id, 0)
        conversions = len([l for l in month_leads if l.get("status") == "converted"])
        
        reports.append({
            "id": emp_id,
            "name": emp["name"],
            "email": emp["email"],
            "role": emp["role"],
            "branch": emp.get("branch"),
            "section": emp.get("section"),
            "assigned_leads": len(month_leads),
            "converted_leads": conversions,
            "visited_leads": len([l for l in month_leads if l.get("status") == "visited"]),
            "conversion_rate": round((conversions / len(month_leads) * 100), 1) if month_leads else 0,
            "total_calls": total_calls,
            "total_sales": round(total_sales, 2),
            "monthly_sales": round(month_total, 2),
            "monthly_target": emp.get("monthly_target", 50000.0)
        })
    return reports


@api.post("/admin/sales/manual")
def log_manual_sale(data: ManualSaleIn, _: dict = Depends(require_admin)):
    sid = new_id()
    doc = {
        "id": sid,
        **data.model_dump(),
        "created_at": now_iso()
    }
    db.collection("manual_sales").document(sid).set(doc)
    return doc


@api.patch("/admin/employees/{uid}")
def update_employee(uid: str, data: dict, user: dict = Depends(require_admin)):
    doc_ref = db.collection("users").document(uid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Employee not found")
    
    # Only allow specific fields to be updated
    allowed = [
        "name", "email", "phone", "secondary_phone", "phone_numbers", "branch", "section", "role", "monthly_target",
        "pancard", "adhaar_card", "bank_details", "commission_rate",
        "is_active", "base_salary", "pancard_image", "adhaar_card_image",
        "date_of_birth", "working_hours_from", "working_hours_to", "service_provider_type",
        "emergency_contact_number", "emergency_contact_person", "address", "gender",
        "date_of_joining", "id_proof_image", "photo", "product_commission_rate", "username", "service_commission_inr", "product_commission_inr", "package_commission_rate", "package_commission_inr", "member_commission_rate", "member_commission_inr"
    ]
    update_data = {k: v for k, v in data.items() if k in allowed}
    
    if "password" in data and data["password"]:
        update_data["password_hash"] = hash_password(data["password"])
    
    if update_data:
        doc_ref.update(update_data)
    
    return doc_ref.get().to_dict()


@api.delete("/admin/employees/{uid}")
def delete_employee(uid: str, _: dict = Depends(require_admin)):
    doc_ref = db.collection("users").document(uid)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(404, "Employee not found")
    emp = doc.to_dict()
    if emp.get("role") == "admin":
        raise HTTPException(400, "Cannot delete an admin user")
    doc_ref.delete()
    return {"ok": True}



@api.get("/admin/employees/{uid}/dashboard")
def get_employee_dashboard(uid: str, user: dict = Depends(require_admin)):
    emp_doc = db.collection("users").document(uid).get()
    if not emp_doc.exists:
        raise HTTPException(404, "Employee not found")
    emp = emp_doc.to_dict()
    
    # Logic copied from get_sales_dashboard but for a specific employee
    coll = db.collection("leads").order_by("created_at", direction="DESCENDING")
    docs = [d.to_dict() for d in coll.stream()]
    
    user_id = emp["id"]
    user_branch = emp.get("branch")
    user_section = emp.get("section")
    
    # Filter for this specific employee
    docs = [
        d for d in docs 
        if d.get("assigned_to") == user_id or 
            (not d.get("assigned_to") and d.get("branch") == user_branch and d.get("section") == user_section)
    ]
    
    today = now_iso()[:10]
    this_month = now_iso()[:7]
    
    todays_sales = 0.0
    monthly_sales = 0.0
    for d in docs:
        payments = d.get("payments", [])
        for p in payments:
            if isinstance(p, dict):
                if p.get("type") == "token":
                    if d.get("status") not in ["converted", "closed"]:
                        continue
                    ts = None
                    for pay in payments:
                        if pay.get("type") == "closure" and pay.get("timestamp"):
                            ts = pay.get("timestamp")
                            break
                    if not ts:
                        ts = d.get("updated_at") or p.get("timestamp") or ""
                else:
                    ts = p.get("timestamp") or ""
                
                amt = p.get("amount", 0.0)
                if ts.startswith(today): todays_sales += amt
                if ts.startswith(this_month): monthly_sales += amt

    # Service Provider specific stats from orders
    orders_stream = db.collection("orders").stream()
    services_count = 0
    services_revenue = 0.0
    products_count = 0
    products_revenue = 0.0
    monthly_services_count = 0
    monthly_services_revenue = 0.0
    
    services_list = []
    
    for doc in orders_stream:
        o = doc.to_dict()
        created_at = o.get("created_at", "")
        is_today = created_at.startswith(today)
        is_current_month = created_at.startswith(this_month)
        
        for it in o.get("items", []):
            if it.get("service_provider") == user_id or it.get("service_provider_2") == user_id:
                qty = it.get("quantity", 0)
                price = it.get("price", 0.0)
                line_total = it.get("line_total", price * qty)
                is_svc = it.get("is_service", True)
                
                services_list.append({
                    "id": o.get("id"),
                    "date": created_at[:10],
                    "client": o.get("full_name"),
                    "phone": o.get("phone"),
                    "item_name": it.get("name"),
                    "qty": qty,
                    "price": price,
                    "line_total": line_total,
                    "is_service": is_svc
                })
                
                if is_svc:
                    services_count += qty
                    services_revenue += line_total
                    if is_current_month:
                        monthly_services_count += qty
                        monthly_services_revenue += line_total
                else:
                    products_count += qty
                    products_revenue += line_total

    return {
        "employee": {k: v for k, v in emp.items() if k != "password_hash"},
        "is_sales": emp.get("role") == "sales",
        "services_stats": {
            "services_count": services_count,
            "services_revenue": round(services_revenue, 2),
            "products_count": products_count,
            "products_revenue": round(products_revenue, 2),
            "monthly_services_count": monthly_services_count,
            "monthly_services_revenue": round(monthly_services_revenue, 2)
        },
        "services": services_list,
        "open": {
            "overdues": len([d for d in docs if d.get("follow_up_date") and d.get("follow_up_date") < today and d.get("status") not in ["converted", "dead"]]),
            "due_today": len([d for d in docs if d.get("follow_up_date") == today and d.get("status") not in ["converted", "dead"]]),
            "total_assigned": len(docs),
            "opportunities": len([d for d in docs if d.get("grade") in ["Hot", "Warm"] and d.get("status") not in ["converted", "dead"]]),
            "todays_sales": round(todays_sales, 2)
        },
        "periodic": {
            "todays_leads": len([d for d in docs if d.get("created_at", "").startswith(today)]),
            "calls_made": len([c for c in db.collection("calls").where("user_id", "==", user_id).select(["timestamp"]).stream() if c.to_dict().get("timestamp", "").startswith(today)]),
            "activities_completed": 0,
            "messages_sent": 0,
            "todays_sales": round(todays_sales, 2)
        },
        "result": {
            "converted": len([d for d in docs if d.get("status") in ["converted", "closed"]]),
            "token_received": len([d for d in docs if d.get("status") == "token received"]),
            "visited": len([d for d in docs if d.get("status") == "visited"]),
            "recycled": len([d for d in docs if d.get("status") == "recycled"]),
            "dead": len([d for d in docs if d.get("status") == "dead"]),
            "monthly_sales": round(monthly_services_revenue, 2) if emp.get("role") != "sales" else round(monthly_sales, 2),
            "monthly_target": emp.get("monthly_target", 50000.0)
        }
    }


@api.get("/admin/employees/{uid}/leads")
def get_employee_leads(uid: str, user: dict = Depends(require_admin)):
    docs = db.collection("leads").where("assigned_to", "==", uid).stream()
    return [d.to_dict() for d in docs]


@api.post("/admin/employees")
def create_employee(data: RegisterIn, user: dict = Depends(require_admin)):
    email = data.email.lower()
    docs = db.collection("users").where("email", "==", email).limit(1).get()
    if docs:
        raise HTTPException(400, "Email already exists")
    uid = new_id()
    user_doc = {
        "id": uid,
        "name": data.name,
        "email": email,
        "password_hash": hash_password(data.password),
        "phone": data.phone or "",
        "secondary_phone": data.secondary_phone or "",
        "phone_numbers": data.phone_numbers or [],
        "branch": data.branch or "Surat",
        "section": data.section or "Men",
        "role": data.role or "sales",
        "pancard": data.pancard or "",
        "adhaar_card": data.adhaar_card or "",
        "bank_details": data.bank_details or "",
        "commission_rate": data.commission_rate if data.commission_rate is not None else 0.05,
        "pancard_image": data.pancard_image or "",
        "adhaar_card_image": data.adhaar_card_image or "",
        "base_salary": data.base_salary if data.base_salary is not None else 0,
        "is_active": True,
        "created_at": now_iso(),
        # Service provider specific fields
        "date_of_birth": data.date_of_birth or "",
        "working_hours_from": data.working_hours_from or "",
        "working_hours_to": data.working_hours_to or "",
        "service_provider_type": data.service_provider_type or "",
        "emergency_contact_number": data.emergency_contact_number or "",
        "emergency_contact_person": data.emergency_contact_person or "",
        "address": data.address or "",
        "gender": data.gender or "",
        "date_of_joining": data.date_of_joining or "",
        "id_proof_image": data.id_proof_image or "",
        "photo": data.photo or "",
        "product_commission_rate": data.product_commission_rate if data.product_commission_rate is not None else 0,
        "username": data.username or "",
    }
    db.collection("users").document(uid).set(user_doc)
    user_doc.pop("password_hash", None)
    return user_doc



# ----- Leads CRM -----
@api.post("/leads")
def create_lead(data: LeadIn, user: dict = Depends(require_employee)):
    lid = new_id()
    assigned_to = None
    assigned_to_name = None
    if user.get("role") == "sales":
        assigned_to = user["id"]
        assigned_to_name = user["name"]
    status = data.status or "new"
    is_client = data.is_client or False
    if data.source and data.source.lower() == "billing":
        status = "client"
        is_client = True

    doc = {
        "id": lid,
        "lead_number": f"LD-{int(time.time())}",
        "name": data.name,
        "phone": data.phone,
        "secondary_phone": data.secondary_phone or "",
        "branch": data.branch,
        "section": data.section,
        "source": data.source,
        "campaign": data.campaign or "",
        "status": status,
        "is_client": is_client,
        "grade": data.grade or "Cold",
        "city": data.city or "",
        "hair_condition": data.hair_condition or "",
        "gender": data.gender or "—",
        "email": data.email or "—",
        "points": data.points if data.points is not None else 0,
        "dob": data.dob or "",
        "anniversary": data.anniversary or "",
        "address": data.address or "",
        "assigned_to": assigned_to,
        "assigned_to_name": assigned_to_name,
        "notes": [{"text": data.notes, "author": user["name"], "timestamp": now_iso()}] if data.notes else [],
        "follow_up_date": None,
        "follow_up_time": None,
        "follow_up_type": None,
        "is_favorite": False,
        "created_by": "Manual",
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    db.collection("leads").document(lid).set(doc)
    return doc


def get_fb_config():
    doc = db.collection("settings").document("fb_config").get()
    if doc.exists:
        data = doc.to_dict()
        return {
            "verify_token": data.get("verify_token") or os.environ.get("FB_VERIFY_TOKEN", "eminence_salon_verify_2026"),
            "page_access_token": data.get("page_access_token") or os.environ.get("FB_PAGE_ACCESS_TOKEN", ""),
            "webhook_secret": data.get("webhook_secret") or os.environ.get("WEBHOOK_SECRET", "eminence_secret_123")
        }
    return {
        "verify_token": os.environ.get("FB_VERIFY_TOKEN", "eminence_salon_verify_2026"),
        "page_access_token": os.environ.get("FB_PAGE_ACCESS_TOKEN", ""),
        "webhook_secret": os.environ.get("WEBHOOK_SECRET", "eminence_secret_123")
    }

@firestore.transactional
def _get_next_salesperson_tx(transaction, routing_ref, available_sales):
    routing_doc = routing_ref.get(transaction=transaction)
    
    next_idx = 0
    if routing_doc.exists:
        routing_data = routing_doc.to_dict()
        last_uid = routing_data.get("last_assigned_uid")
        if last_uid:
            found = False
            for i, u in enumerate(available_sales):
                if u["id"] == last_uid:
                    next_idx = (i + 1) % len(available_sales)
                    found = True
                    break
            if not found:
                for i, u in enumerate(available_sales):
                    if u["id"] > last_uid:
                        next_idx = i
                        found = True
                        break
                        
    next_sales = available_sales[next_idx]
    transaction.set(routing_ref, {
        "last_assigned_uid": next_sales["id"],
        "last_assigned_name": next_sales["name"],
        "updated_at": now_iso()
    })
    return next_sales

def get_next_salesperson():
    sales_docs = db.collection("users").where("role", "==", "sales").get()
    sales_users = [d.to_dict() for d in sales_docs]
    
    # Get current IST date
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_str = ist_now.strftime("%Y-%m-%d")
    
    # Filter available salespersons (active & not on leave today)
    available_sales = [
        u for u in sales_users 
        if u.get("is_active") is not False and today_str not in u.get("leaves", [])
    ]
    
    if not available_sales:
        # Fallback to all active salespersons if all are on leave
        available_sales = [u for u in sales_users if u.get("is_active") is not False]
        
    if not available_sales:
        return None
        
    available_sales.sort(key=lambda u: u["id"])
    
    routing_ref = db.collection("settings").document("lead_routing")
    transaction = db.transaction()
    return _get_next_salesperson_tx(transaction, routing_ref, available_sales)

@api.get("/admin/fb-config")
def admin_get_fb_config(user: dict = Depends(require_admin)):
    doc = db.collection("settings").document("fb_config").get()
    if doc.exists:
        return doc.to_dict()
    return {
        "verify_token": os.environ.get("FB_VERIFY_TOKEN", "eminence_salon_verify_2026"),
        "page_access_token": os.environ.get("FB_PAGE_ACCESS_TOKEN", ""),
        "webhook_secret": os.environ.get("WEBHOOK_SECRET", "eminence_secret_123")
    }

@api.post("/admin/fb-config")
def admin_set_fb_config(data: dict, user: dict = Depends(require_admin)):
    db.collection("settings").document("fb_config").set({
        "verify_token": data.get("verify_token", "eminence_salon_verify_2026"),
        "page_access_token": data.get("page_access_token", ""),
        "webhook_secret": data.get("webhook_secret", "eminence_secret_123"),
        "updated_at": now_iso(),
        "updated_by": user["id"]
    })
    return {"ok": True}

@app.get("/webhooks/facebook", response_class=PlainTextResponse)
def facebook_verify(hub_mode: str = Query(None, alias="hub.mode"), 
                    hub_verify_token: str = Query(None, alias="hub.verify_token"), 
                    hub_challenge: str = Query(None, alias="hub.challenge")):
    cfg = get_fb_config()
    if hub_mode == "subscribe" and hub_verify_token == cfg["verify_token"]:
        return hub_challenge
    return PlainTextResponse("Verification Failed", status_code=403)

@app.get("/webhooks/whatsapp", response_class=PlainTextResponse)
def whatsapp_verify(hub_mode: str = Query(None, alias="hub.mode"), 
                    hub_verify_token: str = Query(None, alias="hub.verify_token"), 
                    hub_challenge: str = Query(None, alias="hub.challenge")):
    cfg = get_fb_config()
    if hub_mode == "subscribe" and hub_verify_token == cfg["verify_token"]:
        return hub_challenge
    return PlainTextResponse("Verification Failed", status_code=403)

@app.post("/webhooks/facebook")
async def facebook_webhook(request: Request):
    try:
        data = await request.json()
    except:
        return {"status": "error", "message": "Invalid JSON"}
        
    cfg = get_fb_config()
    
    if "entry" in data:
        for entry in data["entry"]:
            for change in entry.get("changes", []):
                if change.get("field") == "leadgen":
                    leadgen_id = change["value"].get("leadgen_id")
                    if leadgen_id:
                        token = cfg["page_access_token"]
                        if not token:
                            print(f"ERROR: FB_PAGE_ACCESS_TOKEN not set. Cannot fetch lead {leadgen_id}")
                            continue
                        graph_url = f"https://graph.facebook.com/v19.0/{leadgen_id}?access_token={token}"
                        resp = requests.get(graph_url).json()
                        field_data = {f["name"]: f["values"][0] for f in resp.get("field_data", [])}
                        name = field_data.get("full_name") or field_data.get("name") or "Meta Lead"
                        phone = str(field_data.get("phone_number") or field_data.get("phone") or "")
                        
                        next_sales = get_next_salesperson()
                        assigned_to = next_sales["id"] if next_sales else None
                        assigned_to_name = next_sales["name"] if next_sales else None
                        branch = (next_sales.get("branch") if next_sales else None) or "Baroda"
                        section = (next_sales.get("section") if next_sales else None) or "Men"
                        
                        lid = new_id()
                        doc = {
                            "id": lid,
                            "lead_number": f"LD-{int(time.time())}",
                            "name": name,
                            "phone": phone,
                            "branch": branch,
                            "section": section,
                            "source": "Facebook Ads",
                            "campaign": resp.get("campaign_name", "Meta Direct Ads"),
                            "status": "new",
                            "grade": "Warm",
                            "assigned_to": assigned_to,
                            "assigned_to_name": assigned_to_name,
                            "notes": [{"text": f"Lead captured directly from Meta Ads. Form: {resp.get('form_id')}. Assigned to {assigned_to_name or 'Unassigned'}.", "author": "System", "timestamp": now_iso()}],
                            "created_by": "Meta",
                            "created_at": now_iso(),
                            "updated_at": now_iso()
                        }
                        db.collection("leads").document(lid).set(doc)
        return {"status": "success"}

    auth_key = request.headers.get("X-Webhook-Key")
    if auth_key == cfg["webhook_secret"] or data.get("key") == cfg["webhook_secret"]:
        name = data.get("full_name") or data.get("name")
        phone = str(data.get("phone_number") or data.get("phone") or "")
        if name and phone:
            next_sales = get_next_salesperson()
            assigned_to = next_sales["id"] if next_sales else None
            assigned_to_name = next_sales["name"] if next_sales else None
            branch = (next_sales.get("branch") if next_sales else None) or data.get("branch", "Baroda")
            section = (next_sales.get("section") if next_sales else None) or data.get("section", "Men")
            
            lid = new_id()
            doc = {
                "id": lid,
                "lead_number": f"LD-{int(time.time())}",
                "name": name,
                "phone": phone,
                "branch": branch,
                "section": section,
                "source": "Facebook Ads",
                "campaign": data.get("campaign", "Direct Ads"),
                "status": "new",
                "grade": "Warm",
                "assigned_to": assigned_to,
                "assigned_to_name": assigned_to_name,
                "notes": [{"text": f"Lead captured via Webhook. Assigned to {assigned_to_name or 'Unassigned'}.", "author": "System", "timestamp": now_iso()}],
                "created_by": "Webhook",
                "created_at": now_iso(),
                "updated_at": now_iso()
            }
            db.collection("leads").document(lid).set(doc)
            return {"status": "success", "lead_id": lid}
    return {"status": "ignored"}


@app.post("/webhooks/whatsapp")
async def whatsapp_webhook(request: Request):
    # Validate Verify Token if provided
    cfg = get_fb_config()
    expected_token = cfg.get("verify_token")
    token = (
        request.query_params.get("Verify Token") or
        request.query_params.get("verify_token") or
        request.query_params.get("hub.verify_token")
    )
    if token and token != expected_token:
        raise HTTPException(403, "Invalid verify token")

    try:
        data = await request.json()
        # Save raw webhook log
        try:
            log_id = new_id()
            db.collection("webhook_logs").document(log_id).set({
                "id": log_id,
                "endpoint": "/webhooks/whatsapp",
                "payload": data,
                "received_at": now_iso()
            })
        except Exception as log_err:
            print(f"Failed to log webhook: {log_err}")
    except:
        return {"status": "error", "message": "Invalid JSON"}
        
    # 1. Handle BotSe/BotSpace Workflow Format (Direct JSON)
    if "phone" in data:
        name = data.get("name") or data.get("full_name") or "WhatsApp Lead"
        phone = str(data.get("phone"))
        if not phone.startswith("+"): phone = "+" + phone
        
        # Check for existing
        existing = db.collection("leads").where("phone", "==", phone).get()
        if not existing:
            next_sales = get_next_salesperson()
            assigned_to = next_sales["id"] if next_sales else None
            assigned_to_name = next_sales["name"] if next_sales else None
            branch = (next_sales.get("branch") if next_sales else None) or data.get("branch", "Baroda")
            section = (next_sales.get("section") if next_sales else None) or data.get("section", "Men")
            
            source = data.get("source") or "WhatsApp"
            campaign = data.get("campaign") or "Bot Workflow"
            
            lid = new_id()
            doc = {
                "id": lid,
                "lead_number": f"LD-BOT-{int(time.time())}",
                "name": name,
                "phone": phone,
                "branch": branch,
                "section": section,
                "source": source,
                "campaign": campaign,
                "status": "new",
                "grade": "Hot",
                "assigned_to": assigned_to,
                "assigned_to_name": assigned_to_name,
                "notes": [{"text": f"SYSTEM: Lead captured via Webhook ({source}). Campaign: {campaign}. Assigned to {assigned_to_name or 'Unassigned'}.", "author": "System", "timestamp": now_iso()}],
                "created_by": "Bot Workflow",
                "created_at": now_iso(),
                "updated_at": now_iso()
            }
            db.collection("leads").document(lid).set(doc)
            return {"status": "success", "lead_id": lid}
        else:
            # Re-engage existing lead
            lead_doc = existing[0]
            lead_id = lead_doc.id
            lead_data = lead_doc.to_dict()
            
            message_text = data.get("message") or data.get("text") or data.get("body") or "N/A"
            note_text = f"SYSTEM: Customer sent a new WhatsApp message (Bot Workflow). Message: {message_text}"
            
            note = {
                "text": note_text,
                "author": "System",
                "timestamp": now_iso()
            }
            
            update_payload = {
                "status": "new",
                "created_at": now_iso(),  # bring it to the top of list
                "updated_at": now_iso(),
                "notes": firestore.ArrayUnion([note])
            }
            
            if not lead_data.get("assigned_to"):
                next_sales = get_next_salesperson()
                if next_sales:
                    update_payload["assigned_to"] = next_sales["id"]
                    update_payload["assigned_to_name"] = next_sales["name"]
            
            db.collection("leads").document(lead_id).update(update_payload)
            return {"status": "updated", "lead_id": lead_id}

    # 2. Handle Standard Meta WhatsApp Webhook structure
    if "entry" in data:
        for entry in data["entry"]:
            for change in entry.get("changes", []):
                value = change.get("value", {})
                if "messages" in value:
                    for msg in value["messages"]:
                        customer_phone = msg.get("from")
                        contacts = value.get("contacts", [])
                        customer_name = "WhatsApp Lead"
                        if contacts:
                            customer_name = contacts[0].get("profile", {}).get("name", "WhatsApp Lead")
                        
                        existing_phone = f"+{customer_phone}" if not customer_phone.startswith("+") else customer_phone
                        existing = db.collection("leads").where("phone", "==", existing_phone).get()
                        if not existing:
                            next_sales = get_next_salesperson()
                            assigned_to = next_sales["id"] if next_sales else None
                            assigned_to_name = next_sales["name"] if next_sales else None
                            branch = (next_sales.get("branch") if next_sales else None) or "Baroda"
                            section = (next_sales.get("section") if next_sales else None) or "Men"
                            
                            lid = new_id()
                            doc = {
                                "id": lid,
                                "lead_number": f"LD-WA-{int(time.time())}",
                                "name": customer_name,
                                "phone": existing_phone,
                                "branch": branch,
                                "section": section,
                                "source": "WhatsApp Ads",
                                "campaign": "Direct WhatsApp Message",
                                "status": "new",
                                "grade": "Hot",
                                "assigned_to": assigned_to,
                                "assigned_to_name": assigned_to_name,
                                "notes": [{"text": f"SYSTEM: Lead captured via WhatsApp message. Initial message: {msg.get('text', {}).get('body', 'N/A')}. Assigned to {assigned_to_name or 'Unassigned'}.", "author": "System", "timestamp": now_iso()}],
                                "created_by": "WhatsApp",
                                "created_at": now_iso(),
                                "updated_at": now_iso()
                            }
                            db.collection("leads").document(lid).set(doc)
                        else:
                            # Re-engage existing lead
                            lead_doc = existing[0]
                            lead_id = lead_doc.id
                            lead_data = lead_doc.to_dict()
                            
                            message_text = msg.get("text", {}).get("body", "N/A")
                            note_text = f"SYSTEM: Customer sent a new WhatsApp message. Message: {message_text}"
                            
                            note = {
                                "text": note_text,
                                "author": "System",
                                "timestamp": now_iso()
                            }
                            
                            update_payload = {
                                "status": "new",
                                "created_at": now_iso(),  # bring it to the top of list
                                "updated_at": now_iso(),
                                "notes": firestore.ArrayUnion([note])
                            }
                            
                            if not lead_data.get("assigned_to"):
                                next_sales = get_next_salesperson()
                                if next_sales:
                                    update_payload["assigned_to"] = next_sales["id"]
                                    update_payload["assigned_to_name"] = next_sales["name"]
                                    
                            db.collection("leads").document(lead_id).update(update_payload)
        return {"status": "success"}
    return {"status": "ignored"}


@api.get("/leads/duplicates")
def get_duplicate_leads(user: dict = Depends(require_employee)):
    cfg_doc = db.collection("settings").document("meta_config").get()
    cfg = cfg_doc.to_dict() if cfg_doc.exists else {}
    secret = cfg.get("webhook_secret") or os.environ.get("WEBHOOK_SECRET", "eminence_secret_123")

    leads = db.collection("leads").stream()
    by_phone = {}
    for doc in leads:
        d = doc.to_dict()
        phone = d.get("phone")
        if phone:
            phone_clean = "".join(filter(str.isdigit, phone))
            if len(phone_clean) >= 10:
                phone_key = phone_clean[-10:]
                by_phone.setdefault(phone_key, []).append(d)
                
    duplicates = {}
    for phone_key, group in by_phone.items():
        if len(group) > 1:
            display_phone = group[0].get("phone")
            duplicates[display_phone] = group
            
    return {"secret": secret, "duplicates": duplicates}


@app.get("/webhooks/meta-sync")
def webhook_meta_sync(key: Optional[str] = None):
    cfg = get_fb_config()
    secret = cfg.get("webhook_secret") or os.environ.get("WEBHOOK_SECRET", "eminence_secret_123")
    if key != secret:
        raise HTTPException(401, "Unauthorized: Invalid Webhook Key")
        
    token = cfg.get("page_access_token")
    if not token:
        return {"status": "error", "message": "FB_PAGE_ACCESS_TOKEN not set"}
        
    # Discover page details
    try:
        me_resp = requests.get(f"https://graph.facebook.com/v19.0/me?fields=id,name&access_token={token}").json()
        if "error" in me_resp:
            return {"status": "error", "stage": "me", "error": me_resp["error"]}
        page_id = me_resp.get("id")
        page_name = me_resp.get("name")
    except Exception as e:
        return {"status": "error", "stage": "me", "message": str(e)}
        
    # Get active forms
    try:
        forms_url = f"https://graph.facebook.com/v19.0/{page_id}/leadgen_forms?access_token={token}"
        forms_resp = requests.get(forms_url).json()
        if "error" in forms_resp:
            return {"status": "error", "stage": "forms", "error": forms_resp["error"]}
        forms = forms_resp.get("data", [])
    except Exception as e:
        return {"status": "error", "stage": "forms", "message": str(e)}
        
    leads_synced = []
    leads_errors = []
    since_ts = int(time.time() - 48 * 3600)  # last 48 hours
    
    for form in forms:
        form_id = form.get("id")
        form_name = form.get("name")
        try:
            leads_url = f"https://graph.facebook.com/v19.0/{form_id}/leads?since={since_ts}&access_token={token}"
            leads_resp = requests.get(leads_url).json()
            if "error" in leads_resp:
                leads_errors.append({"form_id": form_id, "form_name": form_name, "error": leads_resp["error"]})
                continue
                
            form_leads = leads_resp.get("data", [])
            for lead in form_leads:
                lead_id = lead.get("id")
                created_time = lead.get("created_time")
                
                field_data = {f["name"]: f["values"][0] for f in lead.get("field_data", [])}
                name = field_data.get("full_name") or field_data.get("name") or "Meta Lead"
                phone = str(field_data.get("phone_number") or field_data.get("phone") or "")
                
                if not phone:
                    continue
                    
                phone_clean = "".join(filter(str.isdigit, phone))
                
                # Check for existing
                existing = False
                docs1 = db.collection("leads").where("phone", "==", phone).get()
                if docs1:
                    existing = True
                else:
                    docs2 = db.collection("leads").where("phone", "==", f"+{phone_clean}").get()
                    if docs2:
                        existing = True
                    else:
                        docs3 = db.collection("leads").where("phone", "==", phone_clean).get()
                        if docs3:
                            existing = True
                            
                if not existing:
                    next_sales = get_next_salesperson()
                    assigned_to = next_sales["id"] if next_sales else None
                    assigned_to_name = next_sales["name"] if next_sales else None
                    branch = (next_sales.get("branch") if next_sales else None) or "Baroda"
                    section = (next_sales.get("section") if next_sales else None) or "Men"
                    
                    lid = new_id()
                    doc = {
                        "id": lid,
                        "lead_number": f"LD-{int(time.time())}",
                        "name": name,
                        "phone": phone,
                        "branch": branch,
                        "section": section,
                        "source": "Facebook Lead Ads",
                        "campaign": lead.get("campaign_name") or form_name or "Meta Sync",
                        "status": "new",
                        "grade": "Warm",
                        "assigned_to": assigned_to,
                        "assigned_to_name": assigned_to_name,
                        "notes": [{"text": f"Lead captured via Meta Graph API Sync. Form: {form_name} ({form_id}). Assigned to {assigned_to_name or 'Unassigned'}.", "author": "System", "timestamp": now_iso()}],
                        "created_by": "Meta Sync",
                        "created_at": created_time or now_iso(),
                        "updated_at": now_iso()
                    }
                    db.collection("leads").document(lid).set(doc)
                    leads_synced.append({
                        "id": lid,
                        "meta_id": lead_id,
                        "name": name,
                        "phone": phone,
                        "form_name": form_name,
                        "assigned_to_name": assigned_to_name
                    })
        except Exception as e:
            leads_errors.append({"form_id": form_id, "form_name": form_name, "error": str(e)})
            
    return {
        "status": "success",
        "page_id": page_id,
        "page_name": page_name,
        "forms_count": len(forms),
        "synced_count": len(leads_synced),
        "synced_leads": leads_synced,
        "errors": leads_errors
    }


@app.get("/webhooks/duplicate-leads")
def webhook_get_duplicate_leads(key: Optional[str] = None, request: Request = None):
    cfg_doc = db.collection("settings").document("meta_config").get()
    cfg = cfg_doc.to_dict() if cfg_doc.exists else {}
    secret = cfg.get("webhook_secret") or os.environ.get("WEBHOOK_SECRET", "eminence_secret_123")
    
    auth_key = (request.headers.get("X-Webhook-Key") if request else None) or key
    if auth_key != secret:
        raise HTTPException(401, "Unauthorized: Invalid Webhook Key")
        
    leads = db.collection("leads").stream()
    by_phone = {}
    for doc in leads:
        d = doc.to_dict()
        phone = d.get("phone")
        if phone:
            phone_clean = "".join(filter(str.isdigit, phone))
            if len(phone_clean) >= 10:
                phone_key = phone_clean[-10:]
                by_phone.setdefault(phone_key, []).append(d)
                
    duplicates = []
    for phone_key, group in by_phone.items():
        if len(group) > 1:
            duplicates.append({
                "phone": group[0].get("phone"),
                "leads": group
            })
            
    return {"status": "success", "duplicates": duplicates}


@api.get("/leads")
def list_leads(all: Optional[bool] = False, user: dict = Depends(require_employee)):
    coll = db.collection("leads")

    def enrich_lead(lead_dict):
        # Fallback to 0 if talk_time is missing from the document
        if "talk_time" not in lead_dict:
            lead_dict["talk_time"] = 0
        return lead_dict

    def is_lead_doc(d):
        return not (d.get("is_client") is True or d.get("source") == "Billing" or d.get("status") == "client")

    if user["role"] == "sales":
        # Sales employees only see their explicitly assigned leads — limit to 1000
        assigned_query = coll.where("assigned_to", "==", user["id"]).limit(1000).stream()
        return sorted([enrich_lead(d.to_dict()) for d in assigned_query if all or is_lead_doc(d.to_dict())], key=lambda x: x.get("created_at", ""), reverse=True)
    elif user["role"] in ["employee", "service", "receptionist"]:
        user_id = user["id"]
        user_branch = user.get("branch")
        user_section = user.get("section")

        assigned_query = coll.where("assigned_to", "==", user_id).limit(500).stream()
        assigned_leads = [d.to_dict() for d in assigned_query]

        unassigned_query = coll.where("assigned_to", "==", None).where("branch", "==", user_branch).where("section", "==", user_section).limit(300).stream()
        unassigned_leads = [d.to_dict() for d in unassigned_query]

        not_decided_section_query = coll.where("assigned_to", "==", None).where("branch", "==", user_branch).where("section", "==", "Not Decided").limit(200).stream()
        not_decided_section_leads = [d.to_dict() for d in not_decided_section_query]

        not_decided_branch_query = coll.where("assigned_to", "==", None).where("branch", "==", "Not Decided").limit(200).stream()
        not_decided_branch_leads = [d.to_dict() for d in not_decided_branch_query]

        merged = {l["id"]: l for l in (assigned_leads + unassigned_leads + not_decided_section_leads + not_decided_branch_leads)}
        result = sorted([enrich_lead(l) for l in merged.values() if all or is_lead_doc(l)], key=lambda x: x.get("created_at", ""), reverse=True)
        return result
    elif user["role"] == "admin":
        # Limit to 500 most recent leads — full 10k scan was extremely expensive
        return [enrich_lead(d.to_dict()) for d in coll.order_by("created_at", direction="DESCENDING").limit(500).stream() if all or is_lead_doc(d.to_dict())]
    else:
        return []


@api.get("/leads/{lid}")
def get_lead(lid: str, user: dict = Depends(require_employee)):
    doc = db.collection("leads").document(lid).get()
    if not doc.exists:
        raise HTTPException(404, "Lead not found")
    data = doc.to_dict()
    if user["role"] == "employee" and data.get("assigned_to") and data.get("assigned_to") != user["id"]:
        raise HTTPException(403, "Not assigned to this lead")
        
    # Fetch orders matching lead phone
    phone = data.get("phone", "")
    phone_clean = "".join(filter(str.isdigit, phone))
    phone_key = phone_clean[-10:] if len(phone_clean) >= 10 else None
    
    orders = []
    if phone_key:
        orders_docs = db.collection("orders").stream()
        for o_doc in orders_docs:
            od = o_doc.to_dict()
            op = od.get("phone", "")
            op_clean = "".join(filter(str.isdigit, op))
            op_key = op_clean[-10:] if len(op_clean) >= 10 else None
            if op_key == phone_key:
                orders.append(od)
        orders.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        
    data["orders"] = orders
    return data


@api.patch("/leads/{lid}")
def update_lead(lid: str, data: LeadUpdate, user: dict = Depends(require_employee)):
    doc_ref = db.collection("leads").document(lid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Lead not found")
    
    update_data = {"updated_at": now_iso()}
    if data.name is not None: update_data["name"] = data.name
    if data.phone is not None: update_data["phone"] = data.phone
    if data.branch is not None: update_data["branch"] = data.branch
    if data.section is not None: update_data["section"] = data.section
    if data.city is not None: update_data["city"] = data.city
    if data.status is not None: update_data["status"] = data.status
    if data.follow_up_date is not None: update_data["follow_up_date"] = data.follow_up_date
    if data.follow_up_time is not None: update_data["follow_up_time"] = data.follow_up_time
    if data.follow_up_type is not None: update_data["follow_up_type"] = data.follow_up_type
    if data.assigned_to is not None: update_data["assigned_to"] = data.assigned_to
    if data.grade is not None: update_data["grade"] = data.grade
    if data.is_favorite is not None: update_data["is_favorite"] = data.is_favorite
    if data.hair_condition is not None: update_data["hair_condition"] = data.hair_condition
    if data.secondary_phone is not None: update_data["secondary_phone"] = data.secondary_phone
    if data.packages is not None: update_data["packages"] = data.packages
    if data.total_sale_amount is not None: update_data["total_sale_amount"] = data.total_sale_amount
    if data.gender is not None: update_data["gender"] = data.gender
    if data.email is not None: update_data["email"] = data.email
    if data.points is not None: update_data["points"] = data.points
    if data.dob is not None: update_data["dob"] = data.dob
    if data.anniversary is not None: update_data["anniversary"] = data.anniversary
    if data.address is not None: update_data["address"] = data.address
    
    doc_ref.update(update_data)
    return doc_ref.get().to_dict()


@api.post("/leads/{lid}/notes")
def add_lead_note(lid: str, data: LeadNoteIn, user: dict = Depends(require_employee)):
    doc_ref = db.collection("leads").document(lid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Lead not found")
    
    note = {"text": data.text, "author": user["name"], "timestamp": now_iso()}
    doc_ref.update({"notes": firestore.ArrayUnion([note]), "updated_at": now_iso()})
    return {"ok": True, "note": note}


@api.patch("/leads/{lid}/assign")
def assign_lead(lid: str, data: LeadUpdate, user: dict = Depends(require_admin)):
    doc_ref = db.collection("leads").document(lid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Lead not found")
    
    assigned_to = data.assigned_to
    assigned_to_name = None
    if assigned_to:
        emp_doc = db.collection("users").document(assigned_to).get()
        if emp_doc.exists:
            assigned_to_name = emp_doc.to_dict().get("name")
            
    doc_ref.update({
        "assigned_to": assigned_to,
        "assigned_to_name": assigned_to_name,
        "updated_at": now_iso()
    })
    return doc_ref.get().to_dict()


@api.post("/consultations")
def create_consultation(data: dict, user: dict = Depends(require_employee)):
    cid = new_id()
    doc = {
        "id": cid,
        **data,
        "created_by": user["name"],
        "created_by_id": user["id"],
        "created_at": now_iso()
    }
    db.collection("consultations").document(cid).set(doc)
    
    # Update or create lead
    phone = data.get("phone", "")
    if phone and not phone.startswith("+"): phone = "+" + phone
    
    existing = list(db.collection("leads").where("phone", "==", phone).limit(1).stream())
    
    note_text = f"Consultation Form Submitted.\nConsulted By: {data.get('consulted_by')}\nExpected Look: {data.get('expected_look')}\nBudget: {data.get('budget_range')}\nNotes: {data.get('notes')}"
    note = {"text": note_text, "author": user["name"], "timestamp": now_iso()}
    
    if existing:
        lead_ref = existing[0].reference
        lead_ref.update({
            "status": "visited",
            "grade": data.get("status", existing[0].to_dict().get("grade")),
            "follow_up_date": data.get("follow_up_date") or existing[0].to_dict().get("follow_up_date"),
            "notes": firestore.ArrayUnion([note]),
            "updated_at": now_iso()
        })
    else:
        lid = new_id()
        lead_doc = {
            "id": lid,
            "lead_number": f"LD-CON-{int(time.time())}",
            "name": data.get("name", "Unknown"),
            "phone": phone,
            "branch": data.get("location", "Baroda"),
            "section": "Men",
            "source": data.get("source", "Direct"),
            "campaign": "Consultation Form",
            "status": "visited",
            "grade": data.get("status", "Warm"),
            "notes": [note],
            "created_by": user["name"],
            "created_at": now_iso(),
            "updated_at": now_iso()
        }
        db.collection("leads").document(lid).set(lead_doc)
        
    return {"status": "success", "id": cid}

@api.put("/consultations/{cid}")
def update_consultation(cid: str, data: dict, user: dict = Depends(require_employee)):
    doc_ref = db.collection("consultations").document(cid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Consultation not found")
    
    update_data = {
        **data,
        "updated_by": user["name"],
        "updated_at": now_iso()
    }
    
    # Remove fields we shouldn't update directly if they exist in the payload
    for k in ["id", "created_by", "created_by_id", "created_at"]:
        update_data.pop(k, None)
        
    doc_ref.update(update_data)
    
    return {"status": "success"}

@api.post("/leads/{lid}/transfer")
def transfer_lead(lid: str, data: TransferLeadIn, user: dict = Depends(require_employee)):
    doc_ref = db.collection("leads").document(lid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Lead not found")

    target_user = None
    if data.target_id:
        target_doc = db.collection("users").document(data.target_id).get()
        if target_doc.exists:
            target_user = target_doc.to_dict()
    elif data.email:
        target_email = data.email.lower()
        target_docs = db.collection("users").where("email", "==", target_email).limit(1).get()
        if target_docs:
            target_user = target_docs[0].to_dict()

    if not target_user:
        raise HTTPException(404, "Target employee not found")
    if target_user["role"] != "sales":
        raise HTTPException(400, "Target user is not a sales employee")
    if target_user["id"] == user["id"]:
        raise HTTPException(400, "Cannot transfer lead to yourself")

    update_data = {
        "assigned_to": target_user["id"],
        "assigned_to_name": target_user["name"],
        "is_transferred": True,
        "transferred_from_id": user["id"],
        "transferred_from_name": user["name"],
        "updated_at": now_iso()
    }
    
    if target_user.get("branch"):
        update_data["branch"] = target_user["branch"]
    if target_user.get("section"):
        update_data["section"] = target_user["section"]
    
    note = {
        "text": f"Lead transferred from {user['name']} to {target_user['name']}",
        "author": "System",
        "timestamp": now_iso()
    }
    update_data["notes"] = firestore.ArrayUnion([note])
    
    doc_ref.update(update_data)
    return {"ok": True, "assigned_to": target_user["name"]}


@api.patch("/leads/{lid}/visit")
def update_visit(lid: str, data: VisitUpdateIn, user: dict = Depends(require_employee)):
    doc_ref = db.collection("leads").document(lid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Lead not found")
    
    update_data = {"updated_at": now_iso()}
    notes_to_add = []

    if data.visit_date:
        update_data["follow_up_date"] = data.visit_date
        update_data["status"] = "visit"
    if data.visit_time:
        update_data["follow_up_time"] = data.visit_time
    
    if data.liked is not None:
        if data.liked:
            update_data["status"] = "in process"
            update_data["grade"] = "Hot"
            msg = f"Visit outcome: Client liked the service. Service ready in {data.service_days or '?' } days."
            if data.note: msg += f" Note: {data.note}"
            notes_to_add.append({"text": msg, "author": user["name"], "timestamp": now_iso()})
        else:
            update_data["status"] = "dead"
            msg = "Visit outcome: Client not interested."
            if data.note: msg += f" Reason: {data.note}"
            notes_to_add.append({"text": msg, "author": user["name"], "timestamp": now_iso()})

    if notes_to_add:
        update_data["notes"] = firestore.ArrayUnion(notes_to_add)
    
    doc_ref.update(update_data)
    return {"ok": True}


# ----- Call Logs & Dashboard -----
@api.post("/leads/{lid}/calls")
def log_call(lid: str, data: CallLogIn, user: dict = Depends(require_employee)):
    doc_ref = db.collection("leads").document(lid)
    if not doc_ref.get().exists:
        raise HTTPException(404, "Lead not found")
        
    call_id = new_id()
    call_doc = {
        "id": call_id,
        "lead_id": lid,
        "user_id": user["id"],
        "duration": data.duration,
        "talk_time": data.talk_time,
        "outcome": data.outcome,
        "comment": data.comment or "",
        "timestamp": now_iso()
    }
    db.collection("calls").document(call_id).set(call_doc)
    
    # Add notes to history
    notes_to_add = []
    
    # Auto update lead status based on outcome
    update_data = {"updated_at": now_iso()}
    lead_snap = doc_ref.get()
    if lead_snap.exists:
        lead_dict = lead_snap.to_dict()
        update_data["talk_time"] = lead_dict.get("talk_time", 0) + data.duration
    
    if data.outcome == "Not Picked Up":
        update_data["status"] = "in process"
    elif data.outcome in ["Said No", "Not Interested"]:
        update_data["status"] = "dead"
    elif data.outcome == "Interested (Follow-up)":
        update_data["status"] = "in process"
        if data.grade: update_data["grade"] = data.grade
        if data.next_followup_date: update_data["follow_up_date"] = data.next_followup_date
        if data.next_followup_time: update_data["follow_up_time"] = data.next_followup_time
    elif data.outcome == "Visit Scheduled":
        update_data["status"] = "visit"
        if data.next_followup_date: update_data["follow_up_date"] = data.next_followup_date
        if data.next_followup_time: update_data["follow_up_time"] = data.next_followup_time
    elif data.outcome == "Visited":
        update_data["status"] = "visited"
        if data.consulted_by:
            note = {"text": f"SYSTEM: Customer visited and was consulted by {data.consulted_by}", "author": "System", "timestamp": now_iso()}
            notes_to_add.append(note)
    elif data.outcome == "Token Received":
        update_data["status"] = "token received"
    elif data.outcome == "Converted":
        update_data["status"] = "converted"
    
    if data.comment:
        notes_to_add.append({"text": f"Call Outcome: {data.outcome} - {data.comment}", "author": user["name"], "timestamp": now_iso()})
        
    # Handle Sale Amount
    if data.sale_amount:
        payment = {
            "amount": data.sale_amount,
            "type": "token" if data.outcome == "Token Received" else "closure",
            "mode": data.payment_mode or "Not Specified",
            "timestamp": now_iso(),
            "recorded_by": user["name"]
        }
        update_data["payments"] = firestore.firestore.ArrayUnion([payment])
        update_data["total_sale_amount"] = firestore.firestore.Increment(data.sale_amount)
        
        # Add payment tracking note
        ptype = "Token" if data.outcome == "Token Received" else "Closure Amount"
        pmode = data.payment_mode or "Not Specified"
        notes_to_add.append({
            "text": f"SYSTEM: {user['name']} collected {ptype} of ₹{data.sale_amount:,.2f} via {pmode}", 
            "author": "System", 
            "timestamp": now_iso()
        })

    if notes_to_add:
        update_data["notes"] = firestore.firestore.ArrayUnion(notes_to_add)

    doc_ref.update(update_data)
    return {"ok": True, "call_id": call_id}


@api.get("/sales/dashboard")
def get_sales_dashboard(
    date: str = None, 
    period: str = "daily", 
    results_date: str = None, 
    results_period: str = "monthly",
    start_date: str = None,
    end_date: str = None,
    res_start_date: str = None,
    res_end_date: str = None,
    user: dict = Depends(require_employee)
):
    coll = db.collection("leads")
    # Only fetch fields needed for stats to speed up query
    fields = ["created_at", "updated_at", "status", "grade", "follow_up_date", "payments", "assigned_to", "branch", "section"]
    if user["role"] == "sales":
        # Sales employees only see their explicitly assigned leads
        assigned_query = coll.where("assigned_to", "==", user["id"]).select(fields).limit(10000).stream()
        docs = [d.to_dict() for d in assigned_query]
    elif user["role"] in ["employee", "service", "receptionist"]:
        user_id = user["id"]
        user_branch = user.get("branch")
        user_section = user.get("section")
        
        assigned_query = coll.where("assigned_to", "==", user_id).select(fields).limit(10000).stream()
        unassigned_query = coll.where("assigned_to", "==", None).where("branch", "==", user_branch).where("section", "==", user_section).select(fields).limit(5000).stream()
        
        merged = {l.id: l.to_dict() for l in (list(assigned_query) + list(unassigned_query))}
        docs = list(merged.values())
    else:
        # Admin: Limit raised to include all leads
        docs = [d.to_dict() for d in coll.select(fields).order_by("created_at", direction="DESCENDING").limit(10000).stream()]
    
    # Exclude billing-only clients from leads dashboard stats
    docs = [d for d in docs if not (d.get("is_client") is True or d.get("source") == "Billing" or d.get("status") == "client")]
    
    target_date = date if date else now_iso()[:10]
    res_date = results_date if results_date else now_iso()[:10]
    
    def get_range(target, p, s=None, e=None):
        try:
            dt = datetime.fromisoformat(target)
            if p == "daily":
                return target, target
            if p == "weekly":
                start = (dt - timedelta(days=dt.weekday())).isoformat()[:10]
                end = (dt - timedelta(days=dt.weekday()) + timedelta(days=6)).isoformat()[:10]
                return start, end
            if p == "monthly":
                return target[:7] + "-01", target[:7] + "-31" # Simple approx or use calendar
            if p == "quarterly":
                q = (dt.month - 1) // 3
                sm = q * 3 + 1
                em = sm + 2
                return f"{dt.year:04d}-{sm:02d}-01", f"{dt.year:04d}-{em:02d}-31"
            if p == "yearly":
                return f"{dt.year:04d}-01-01", f"{dt.year:04d}-12-31"
            if p == "custom":
                return s if s else target, e if e else target
        except:
            return target, target
        return target, target

    p_start, p_end = get_range(target_date, period, start_date, end_date)
    r_start, r_end = get_range(res_date, results_period, res_start_date, res_end_date)

    def is_in(ts, start, end):
        if not ts: return False
        return start <= ts[:10] <= end

    def get_effective_ts(p, d):
        if p.get("type") == "token":
            if d.get("status") not in ["converted", "closed"]:
                return ""
            for pay in d.get("payments", []):
                if pay.get("type") == "closure" and pay.get("timestamp"):
                    return pay.get("timestamp")
            return d.get("updated_at") or p.get("timestamp") or ""
        return p.get("timestamp") or ""

    # Periodic Stats (Leads/Sales in selected period)
    period_sales = 0.0
    for d in docs:
        for p in d.get("payments", []):
            eff_ts = get_effective_ts(p, d)
            if is_in(eff_ts, p_start, p_end):
                period_sales += p.get("amount", 0.0)

    # Result Stats (Conversions/Visits in selected results period)
    def check_result(d, status_list):
        if d.get("status") not in status_list: return False
        # Use updated_at as a proxy for when the status was reached
        return is_in(d.get("updated_at"), r_start, r_end)

    this_month = now_iso()[:7]
    monthly_sales = 0.0
    for d in docs:
        for p in d.get("payments", []):
            eff_ts = get_effective_ts(p, d)
            if eff_ts.startswith(this_month):
                monthly_sales += p.get("amount", 0.0)

    stats = {
        "open": {
            "overdues": len([d for d in docs if d.get("follow_up_date") and d.get("follow_up_date") < target_date and d.get("status") not in ["converted", "dead"]]),
            "due_today": len([d for d in docs if d.get("follow_up_date") == target_date and d.get("status") not in ["converted", "dead"]]),
            "total_assigned": len(docs),
            "opportunities": len([d for d in docs if d.get("grade") in ["Hot", "Warm"] and d.get("status") not in ["converted", "dead"]]),
            "todays_sales": round(period_sales, 2), 
        },
        "periodic": {
            "leads": len([d for d in docs if is_in(d.get("created_at"), p_start, p_end)]),
            "calls_made": 0,
            "activities_completed": 0,
            "messages_sent": 0,
            "sales": round(period_sales, 2)
        },
        "result": {
            "converted": len([d for d in docs if check_result(d, ["converted", "closed"])]),
            "token_received": len([d for d in docs if check_result(d, ["token received"])]),
            "visited": len([d for d in docs if check_result(d, ["visited"])]),
            "recycled": len([d for d in docs if check_result(d, ["recycled"])]),
            "dead": len([d for d in docs if check_result(d, ["dead"])]),
            "closed_won": len([d for d in docs if check_result(d, ["converted", "closed"]) and d.get("grade") in ["Hot", "Warm"]]),
            "on_hold": len([d for d in docs if check_result(d, ["in process"]) and d.get("grade") == "Cold"]),
            "closed_lost": len([d for d in docs if check_result(d, ["dead"]) and d.get("grade") in ["Hot", "Warm"]]),
            "monthly_sales": round(monthly_sales, 2),
            "monthly_target": user.get("monthly_target", 50000.0)
        }
    }
    return stats


# ----- Webhook -----
class WhatsAppPayload(BaseModel):
    # Minimal structure for webhook
    entry: list

@api.post("/webhook/whatsapp")
async def whatsapp_webhook(payload: dict):
    logger.info(f"Received WhatsApp webhook: {payload}")
    try:
        # Example parsing (will depend on exact Meta API structure)
        # For now, just log and store raw if needed
        # Create a new lead from the webhook if it's a new message
        entries = payload.get("entry", [])
        for entry in entries:
            changes = entry.get("changes", [])
            for change in changes:
                val = change.get("value", {})
                messages = val.get("messages", [])
                contacts = val.get("contacts", [])
                
                for msg in messages:
                    # Basic extraction
                    phone = msg.get("from")
                    text = msg.get("text", {}).get("body", "")
                    
                    # Find name from contacts
                    name = "WhatsApp User"
                    for c in contacts:
                        if c.get("wa_id") == phone:
                            name = c.get("profile", {}).get("name", name)
                    
                    # Create lead if not exists
                    docs = db.collection("leads").where("phone", "==", phone).limit(1).get()
                    if not docs:
                        lid = new_id()
                        db.collection("leads").document(lid).set({
                            "id": lid,
                            "name": name,
                            "phone": phone,
                            "source": "whatsapp",
                            "status": "new",
                            "assigned_to": None,
                            "notes": [{"text": f"Initial message: {text}", "author": "System", "timestamp": now_iso()}],
                            "created_at": now_iso(),
                            "updated_at": now_iso()
                        })
                    else:
                        doc = docs[0]
                        doc.reference.update({
                            "notes": firestore.ArrayUnion([{"text": f"New message: {text}", "author": "System", "timestamp": now_iso()}]),
                            "updated_at": now_iso()
                        })
    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
    
    return {"status": "ok"}


@api.get("/webhook/whatsapp")
async def verify_whatsapp_webhook(request: Request):
    # Meta verification
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    
    # In production, check token matches your VERIFY_TOKEN
    if mode == "subscribe":
        return Response(content=challenge, status_code=200)
    return Response(status_code=403)


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- Seeding -----
SAMPLE_SERVICES = [
    {"name": "Signature Hair Cut & Style", "category": "Hair", "price": 1200, "duration_min": 60,
     "description": "Precision cut tailored to your face shape, finished with a luxe blow-dry.",
     "image_url": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800"},
    {"name": "Global Hair Colour", "category": "Hair", "price": 4500, "duration_min": 120,
     "description": "Premium ammonia-free colour for lustrous, even tone from root to tip.",
     "image_url": "https://images.unsplash.com/photo-1522336572468-97b06e8ef143?w=800"},
    {"name": "Keratin Smoothening", "category": "Hair", "price": 6500, "duration_min": 180,
     "description": "Frizz-free, salon-smooth hair that lasts up to 5 months.",
     "image_url": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800"},
    {"name": "Hydra-Glow Facial", "category": "Skin", "price": 2800, "duration_min": 75,
     "description": "Deep cleansing, exfoliation and serum infusion for instant radiance.",
     "image_url": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800"},
    {"name": "Anti-Aging Gold Facial", "category": "Skin", "price": 4200, "duration_min": 90,
     "description": "24K gold infusion to restore firmness, lift and youthful glow.",
     "image_url": "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=800"},
    {"name": "Bridal Makeup Package", "category": "Bridal", "price": 18500, "duration_min": 180,
     "description": "Full bridal look including HD makeup, hair styling, and saree draping.",
     "image_url": "https://images.unsplash.com/photo-1597586124394-fbd6ef244026?w=800"},
    {"name": "Aromatherapy Spa", "category": "Spa", "price": 3200, "duration_min": 90,
     "description": "Relaxing full-body massage with essential oils to release tension.",
     "image_url": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800"},
    {"name": "Mani-Pedi Luxe", "category": "Nails", "price": 1800, "duration_min": 75,
     "description": "Spa manicure and pedicure with paraffin wax and gel finish.",
     "image_url": "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800"},
]

SAMPLE_PRODUCTS = []

SAMPLE_STYLISTS = [
    {"name": "Aanya Kapoor", "role": "Creative Director",
     "bio": "12+ years of editorial styling. Trained in London.",
     "specialties": ["Cuts", "Colour"],
     "image_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600"},
    {"name": "Vikram Mehta", "role": "Senior Hair Stylist",
     "bio": "Specialist in textured hair and gentlemen's grooming.",
     "specialties": ["Cuts", "Beard"],
     "image_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600"},
    {"name": "Riya Shah", "role": "Skin & Bridal Expert",
     "bio": "Certified aesthetician. Bridal makeup artist for 200+ brides.",
     "specialties": ["Facial", "Bridal"],
     "image_url": "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600"},
    {"name": "Devansh Patel", "role": "Colour Specialist",
     "bio": "Balayage and fashion colour expert.",
     "specialties": ["Colour", "Highlights"],
     "image_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600"},
    {"name": "Sana Ali", "role": "Spa Therapist",
     "bio": "Trained in Thai, Swedish and Ayurvedic massage techniques.",
     "specialties": ["Spa", "Massage"],
     "image_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600"},
]


def seed():
    # Admin
    docs = db.collection("users").where("email", "==", ADMIN_EMAIL).limit(1).get()
    if not docs:
        uid = new_id()
        db.collection("users").document(uid).set({
            "id": uid,
            "name": "Eminence Admin",
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "phone": "+91 99999 99999",
            "role": "admin",
            "created_at": now_iso(),
        })
        logger.info("Admin user seeded")
    else:
        user = docs[0].to_dict()
        if not verify_password(ADMIN_PASSWORD, user["password_hash"]):
            docs[0].reference.update({
                "password_hash": hash_password(ADMIN_PASSWORD),
                "role": "admin"
            })

    # Demo user
    demo_email = "demo@eminence.com"
    if not db.collection("users").where("email", "==", demo_email).limit(1).get():
        uid = new_id()
        db.collection("users").document(uid).set({
            "id": uid,
            "name": "Demo User",
            "email": demo_email,
            "password_hash": hash_password("Demo@123"),
            "phone": "+91 98765 43210",
            "role": "user",
            "created_at": now_iso(),
        })

    # Services
    if len(list(db.collection("services").limit(1).stream())) == 0:
        for s in SAMPLE_SERVICES:
            sid = new_id()
            db.collection("services").document(sid).set({"id": sid, **s, "created_at": now_iso()})
        logger.info("Services seeded")

    # Products
    if len(list(db.collection("products").limit(1).stream())) == 0:
        for p in SAMPLE_PRODUCTS:
            pid = new_id()
            db.collection("products").document(pid).set({"id": pid, **p, "created_at": now_iso()})
        logger.info("Products seeded")

    # Stylists
    if len(list(db.collection("stylists").limit(1).stream())) == 0:
        for s in SAMPLE_STYLISTS:
            stid = new_id()
            db.collection("stylists").document(stid).set({"id": stid, **s, "created_at": now_iso()})
        logger.info("Stylists seeded")


@app.on_event("startup")
def on_start():
    seed()


@app.on_event("shutdown")
def on_stop():
    pass
