"""
AssetFlow Demo Data Seeder
Seeds the Supabase database with realistic demo data for the hackathon presentation.
Run: python seed.py
"""

import os
import sys
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime, timedelta
import uuid

# Load env from parent directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

print("🌱 Starting AssetFlow demo data seed...\n")


# ============================================================
# 1. Create Demo Users via Supabase Auth
# ============================================================
print("👤 Creating demo users...")

demo_users = [
    {"email": "admin@assetflow.demo", "password": "demo1234", "full_name": "Aditi Rao", "role": "admin"},
    {"email": "manager@assetflow.demo", "password": "demo1234", "full_name": "Rohan Mehta", "role": "asset_manager"},
    {"email": "head@assetflow.demo", "password": "demo1234", "full_name": "Sana Iqbal", "role": "department_head"},
    {"email": "priya@assetflow.demo", "password": "demo1234", "full_name": "Priya Shah", "role": "employee"},
    {"email": "raj@assetflow.demo", "password": "demo1234", "full_name": "Raj Kumar", "role": "employee"},
    {"email": "arjun@assetflow.demo", "password": "demo1234", "full_name": "Arjun Nair", "role": "employee"},
    {"email": "meera@assetflow.demo", "password": "demo1234", "full_name": "Meera Joshi", "role": "employee"},
    {"email": "vikram@assetflow.demo", "password": "demo1234", "full_name": "Vikram Singh", "role": "employee"},
]

user_ids = {}

for u in demo_users:
    try:
        # Create user via admin auth API
        auth_response = sb.auth.admin.create_user({
            "email": u["email"],
            "password": u["password"],
            "email_confirm": True,
            "user_metadata": {"full_name": u["full_name"]}
        })

        if auth_response and auth_response.user:
            user_id = str(auth_response.user.id)
            user_ids[u["email"]] = user_id
            print(f"  ✅ Created user: {u['full_name']} ({u['email']}) -> {user_id}")
        else:
            print(f"  ⚠️ Could not create {u['email']}")
    except Exception as e:
        if "already been registered" in str(e).lower() or "already exists" in str(e).lower():
            # User exists, try to find them
            try:
                existing = sb.table("profiles").select("id").eq("email", u["email"]).single().execute()
                if existing.data:
                    user_ids[u["email"]] = existing.data["id"]
                    print(f"  ⏩ Already exists: {u['full_name']} ({u['email']})")
            except:
                print(f"  ⚠️ User exists but couldn't fetch: {u['email']}")
        else:
            print(f"  ❌ Error creating {u['email']}: {e}")

# ============================================================
# 2. Update user roles (profiles are auto-created by trigger)
# ============================================================
print("\n🔑 Updating user roles...")

for u in demo_users:
    uid = user_ids.get(u["email"])
    if uid:
        try:
            sb.table("profiles").update({
                "role": u["role"],
                "full_name": u["full_name"]
            }).eq("id", uid).execute()
            print(f"  ✅ {u['full_name']} -> {u['role']}")
        except Exception as e:
            print(f"  ❌ Error: {e}")

# ============================================================
# 3. Create Departments
# ============================================================
print("\n🏢 Creating departments...")

departments_data = [
    {"name": "Engineering", "status": "active"},
    {"name": "Facilities", "status": "active"},
    {"name": "Procurement", "status": "active"},
    {"name": "HR", "status": "active"},
    {"name": "Field Ops", "status": "active"},
    {"name": "Field Ops (East)", "status": "inactive"},
]

dept_ids = {}
for dept in departments_data:
    try:
        result = sb.table("departments").insert(dept).execute()
        if result.data:
            dept_ids[dept["name"]] = result.data[0]["id"]
            print(f"  ✅ {dept['name']}")
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            existing = sb.table("departments").select("id").eq("name", dept["name"]).single().execute()
            if existing.data:
                dept_ids[dept["name"]] = existing.data["id"]
                print(f"  ⏩ Already exists: {dept['name']}")
        else:
            print(f"  ❌ Error: {e}")

# Assign department heads
for dept_name, head_email in [("Engineering", "head@assetflow.demo"), ("Facilities", "manager@assetflow.demo")]:
    if dept_name in dept_ids and head_email in user_ids:
        sb.table("departments").update({"head_id": user_ids[head_email]}).eq("id", dept_ids[dept_name]).execute()

# Set parent department
if "Field Ops (East)" in dept_ids and "Field Ops" in dept_ids:
    sb.table("departments").update({"parent_id": dept_ids["Field Ops"]}).eq("id", dept_ids["Field Ops (East)"]).execute()

# Assign users to departments
dept_assignments = {
    "priya@assetflow.demo": "Engineering",
    "raj@assetflow.demo": "Engineering",
    "arjun@assetflow.demo": "Facilities",
    "meera@assetflow.demo": "Procurement",
    "vikram@assetflow.demo": "HR",
    "head@assetflow.demo": "Engineering",
}

for email, dept in dept_assignments.items():
    if email in user_ids and dept in dept_ids:
        sb.table("profiles").update({"department_id": dept_ids[dept]}).eq("id", user_ids[email]).execute()

# ============================================================
# 4. Create Asset Categories
# ============================================================
print("\n📁 Creating asset categories...")

categories_data = [
    {"name": "Electronics", "description": "Laptops, projectors, monitors, etc."},
    {"name": "Furniture", "description": "Desks, chairs, cabinets"},
    {"name": "Vehicles", "description": "Company cars, vans, forklifts"},
    {"name": "Office Equipment", "description": "Printers, scanners, shredders"},
    {"name": "Meeting Rooms", "description": "Conference rooms, board rooms"},
]

cat_ids = {}
for cat in categories_data:
    try:
        result = sb.table("asset_categories").insert(cat).execute()
        if result.data:
            cat_ids[cat["name"]] = result.data[0]["id"]
            print(f"  ✅ {cat['name']}")
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            existing = sb.table("asset_categories").select("id").eq("name", cat["name"]).single().execute()
            if existing.data:
                cat_ids[cat["name"]] = existing.data["id"]
                print(f"  ⏩ Already exists: {cat['name']}")
        else:
            print(f"  ❌ Error: {e}")

# ============================================================
# 5. Create Assets
# ============================================================
print("\n📦 Creating assets...")

assets_data = [
    {"name": "Dell Laptop", "category": "Electronics", "serial_number": "DL-2024-001", "condition": "good", "location": "Bengaluru", "dept": "Engineering", "status": "allocated"},
    {"name": "Projector", "category": "Electronics", "serial_number": "PJ-2024-001", "condition": "fair", "location": "HQ Floor 2", "dept": "Facilities", "status": "under_maintenance"},
    {"name": "Office Chair", "category": "Furniture", "serial_number": "OC-2024-001", "condition": "good", "location": "Warehouse", "status": "available"},
    {"name": "MacBook Pro", "category": "Electronics", "serial_number": "MB-2024-001", "condition": "new", "location": "Bengaluru", "dept": "Engineering", "status": "available"},
    {"name": "Standing Desk", "category": "Furniture", "serial_number": "SD-2024-001", "condition": "good", "location": "HQ Floor 3", "dept": "HR", "status": "available"},
    {"name": "Company Van", "category": "Vehicles", "serial_number": "VAN-2024-001", "condition": "good", "location": "Parking Lot A", "dept": "Field Ops", "status": "allocated"},
    {"name": "Laser Printer", "category": "Office Equipment", "serial_number": "LP-2024-001", "condition": "good", "location": "HQ Floor 1", "status": "available"},
    {"name": "Conference Room B2", "category": "Meeting Rooms", "condition": "good", "location": "HQ Floor 2", "is_bookable": True, "status": "available"},
    {"name": "Board Room A1", "category": "Meeting Rooms", "condition": "good", "location": "HQ Floor 1", "is_bookable": True, "status": "available"},
    {"name": "Monitor 27inch", "category": "Electronics", "serial_number": "MN-2024-001", "condition": "good", "location": "Bengaluru", "dept": "Engineering", "status": "available"},
    {"name": "Forklift", "category": "Vehicles", "serial_number": "FK-2024-001", "condition": "fair", "location": "Warehouse", "dept": "Facilities", "status": "available", "warranty_expiry": (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")},
    {"name": "Camera", "category": "Electronics", "serial_number": "CM-2024-001", "condition": "good", "location": "HQ Floor 2", "dept": "Procurement", "status": "available"},
    {"name": "Office Chair (Exec)", "category": "Furniture", "serial_number": "OC-2024-002", "condition": "damaged", "location": "Desk E14", "dept": "Engineering", "status": "available"},
    {"name": "Whiteboard", "category": "Furniture", "serial_number": "WB-2024-001", "condition": "good", "location": "HQ Floor 2", "status": "available"},
    {"name": "Scanner", "category": "Office Equipment", "serial_number": "SC-2024-001", "condition": "poor", "location": "HQ Floor 1", "status": "available"},
]

asset_ids = {}
for a in assets_data:
    try:
        data = {
            "name": a["name"],
            "category_id": cat_ids.get(a.get("category")),
            "serial_number": a.get("serial_number"),
            "condition": a.get("condition", "good"),
            "location": a.get("location"),
            "department_id": dept_ids.get(a.get("dept")),
            "is_bookable": a.get("is_bookable", False),
            "status": a.get("status", "available"),
            "acquisition_date": (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d"),
            "acquisition_cost": 25000 + hash(a["name"]) % 75000,
        }
        if a.get("warranty_expiry"):
            data["warranty_expiry"] = a["warranty_expiry"]

        result = sb.table("assets").insert(data).execute()
        if result.data:
            asset_ids[a["name"]] = result.data[0]["id"]
            print(f"  ✅ {result.data[0]['tag']} — {a['name']}")
    except Exception as e:
        print(f"  ❌ Error creating {a['name']}: {e}")

# ============================================================
# 6. Create Allocations
# ============================================================
print("\n🔗 Creating allocations...")

if "Dell Laptop" in asset_ids and "priya@assetflow.demo" in user_ids and "manager@assetflow.demo" in user_ids:
    try:
        sb.table("allocations").insert({
            "asset_id": asset_ids["Dell Laptop"],
            "allocated_to": user_ids["priya@assetflow.demo"],
            "department_id": dept_ids.get("Engineering"),
            "allocated_by": user_ids["manager@assetflow.demo"],
            "expected_return_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
            "status": "active"
        }).execute()
        print(f"  ✅ Dell Laptop -> Priya Shah (Engineering)")
    except Exception as e:
        print(f"  ❌ Error: {e}")

if "Company Van" in asset_ids and "vikram@assetflow.demo" in user_ids and "manager@assetflow.demo" in user_ids:
    try:
        sb.table("allocations").insert({
            "asset_id": asset_ids["Company Van"],
            "allocated_to": user_ids["vikram@assetflow.demo"],
            "department_id": dept_ids.get("Field Ops"),
            "allocated_by": user_ids["manager@assetflow.demo"],
            "expected_return_date": (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d"),
            "status": "active"
        }).execute()
        print(f"  ✅ Company Van -> Vikram Singh (overdue!)")
    except Exception as e:
        print(f"  ❌ Error: {e}")

# Historical allocation (returned)
if "Dell Laptop" in asset_ids and "arjun@assetflow.demo" in user_ids:
    try:
        sb.table("allocations").insert({
            "asset_id": asset_ids["Dell Laptop"],
            "allocated_to": user_ids["arjun@assetflow.demo"],
            "department_id": dept_ids.get("Facilities"),
            "allocated_by": user_ids["manager@assetflow.demo"],
            "actual_return_date": (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d"),
            "status": "returned",
            "condition_notes": "good"
        }).execute()
        print(f"  ✅ Historical: Dell Laptop returned by Arjun Nair")
    except Exception as e:
        print(f"  ❌ Error: {e}")

# ============================================================
# 7. Create Bookings
# ============================================================
print("\n📅 Creating bookings...")

if "Conference Room B2" in asset_ids and "meera@assetflow.demo" in user_ids:
    today = datetime.now().strftime("%Y-%m-%d")
    try:
        sb.table("bookings").insert({
            "asset_id": asset_ids["Conference Room B2"],
            "booked_by": user_ids["meera@assetflow.demo"],
            "title": "Procurement Team Standup",
            "start_time": f"{today}T09:00:00+05:30",
            "end_time": f"{today}T10:00:00+05:30",
            "status": "upcoming"
        }).execute()
        print(f"  ✅ Conference Room B2: 9:00–10:00 (Procurement Team)")
    except Exception as e:
        print(f"  ❌ Error: {e}")

    try:
        sb.table("bookings").insert({
            "asset_id": asset_ids["Conference Room B2"],
            "booked_by": user_ids.get("priya@assetflow.demo", user_ids.get("meera@assetflow.demo")),
            "title": "Engineering Review",
            "start_time": f"{today}T14:00:00+05:30",
            "end_time": f"{today}T15:00:00+05:30",
            "status": "upcoming"
        }).execute()
        print(f"  ✅ Conference Room B2: 2:00–3:00 PM (Engineering Review)")
    except Exception as e:
        print(f"  ❌ Error: {e}")

# ============================================================
# 8. Create Maintenance Requests
# ============================================================
print("\n🔧 Creating maintenance requests...")

maint_data = [
    {"asset": "Projector", "issue": "Projector bulb not turning on", "priority": "high", "status": "pending", "user": "arjun@assetflow.demo"},
    {"asset": "Laser Printer", "issue": "Printer jam — paper feed mechanism broken", "priority": "medium", "status": "in_progress", "user": "raj@assetflow.demo", "tech": "R. Varma"},
    {"asset": "Office Chair (Exec)", "issue": "Chair repair — broken armrest", "priority": "low", "status": "resolved", "user": "priya@assetflow.demo"},
]

for m in maint_data:
    if m["asset"] in asset_ids and m["user"] in user_ids:
        try:
            data = {
                "asset_id": asset_ids[m["asset"]],
                "raised_by": user_ids[m["user"]],
                "issue_description": m["issue"],
                "priority": m["priority"],
                "status": m["status"],
            }
            if m.get("tech"):
                data["technician_name"] = m["tech"]
            if m["status"] == "resolved":
                data["resolved_at"] = datetime.now().isoformat()
            if m["status"] in ["approved", "technician_assigned", "in_progress", "resolved"]:
                data["approved_by"] = user_ids.get("manager@assetflow.demo")

            sb.table("maintenance_requests").insert(data).execute()
            print(f"  ✅ {m['asset']}: {m['issue'][:40]}... ({m['status']})")
        except Exception as e:
            print(f"  ❌ Error: {e}")

# ============================================================
# 9. Create Sample Notifications
# ============================================================
print("\n🔔 Creating sample notifications...")

notif_data = [
    {"user": "admin@assetflow.demo", "type": "allocation", "title": "Laptop AF-0014 assigned to Priya Shah"},
    {"user": "manager@assetflow.demo", "type": "maintenance", "title": "Maintenance request AF-0055 approved"},
    {"user": "priya@assetflow.demo", "type": "booking", "title": "Booking confirmed: Room B2 : 2:00 to 3:00 PM"},
    {"user": "admin@assetflow.demo", "type": "transfer", "title": "Transfer approved: AF-0033 to Facilities dept"},
    {"user": "manager@assetflow.demo", "type": "alert", "title": "Overdue return: AF-0021 was due 3 days ago"},
    {"user": "admin@assetflow.demo", "type": "audit", "title": "Audit discrepancy flagged: AF-0088 damaged"},
]

for n in notif_data:
    if n["user"] in user_ids:
        try:
            sb.table("notifications").insert({
                "user_id": user_ids[n["user"]],
                "type": n["type"],
                "title": n["title"],
                "message": n["title"],
            }).execute()
        except Exception as e:
            print(f"  ❌ Error: {e}")

print(f"  ✅ Created {len(notif_data)} sample notifications")

# ============================================================
# 10. Create Activity Logs
# ============================================================
print("\n📋 Creating activity logs...")

logs = [
    {"user": "admin@assetflow.demo", "action": "Created department Engineering", "entity_type": "department"},
    {"user": "manager@assetflow.demo", "action": "Registered asset Dell Laptop (AF-0012)", "entity_type": "asset"},
    {"user": "manager@assetflow.demo", "action": "Allocated AF-0114 to Priya Shah", "entity_type": "allocation"},
    {"user": "priya@assetflow.demo", "action": "Booked Conference Room B2 — 2:00 to 3:00 PM", "entity_type": "booking"},
    {"user": "manager@assetflow.demo", "action": "Approved maintenance for AF-0062", "entity_type": "maintenance"},
]

for log in logs:
    if log["user"] in user_ids:
        try:
            sb.table("activity_logs").insert({
                "user_id": user_ids[log["user"]],
                "user_name": next(u["full_name"] for u in demo_users if u["email"] == log["user"]),
                "action": log["action"],
                "entity_type": log["entity_type"],
            }).execute()
        except Exception as e:
            print(f"  ❌ Error: {e}")

print(f"  ✅ Created {len(logs)} activity log entries")

# ============================================================
# DONE!
# ============================================================
print("\n" + "=" * 50)
print("✅ SEED COMPLETE!")
print("=" * 50)
print("\n📌 Demo accounts:")
print("  Admin:          admin@assetflow.demo / demo1234")
print("  Asset Manager:  manager@assetflow.demo / demo1234")
print("  Dept Head:      head@assetflow.demo / demo1234")
print("  Employee:       priya@assetflow.demo / demo1234")
print("  Employee:       raj@assetflow.demo / demo1234")
print(f"\n📊 Created: {len(user_ids)} users, {len(dept_ids)} departments, {len(cat_ids)} categories, {len(asset_ids)} assets")
print(f"📌 Key demo scenarios ready:")
print(f"  • Double-allocation block: Try allocating 'Dell Laptop' (already held by Priya)")
print(f"  • Booking overlap: Try booking Room B2 at 9:30 (conflicts with 9:00-10:00)")
print(f"  • Overdue return: Company Van allocated to Vikram (3 days overdue)")
print(f"  • Maintenance kanban: Projector pending, Printer in-progress, Chair resolved")
