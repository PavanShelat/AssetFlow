from fastapi import APIRouter, Header
from typing import Optional
from app.config import get_supabase
from app.routers.auth import get_current_user

router = APIRouter()


@router.get("/dashboard")
def get_dashboard_stats(authorization: str = Header(None)):
    """Get KPI dashboard data."""
    user = get_current_user(authorization)
    sb = get_supabase()

    # Asset counts by status
    all_assets = sb.table("assets").select("status").execute()
    status_counts = {}
    for a in all_assets.data:
        s = a["status"]
        status_counts[s] = status_counts.get(s, 0) + 1

    # Active bookings
    active_bookings = sb.table("bookings").select("id", count="exact").in_("status", ["upcoming", "ongoing"]).execute()

    # Pending transfers
    pending_transfers = sb.table("transfer_requests").select("id", count="exact").eq("status", "requested").execute()

    # Upcoming returns (active allocations with expected_return_date)
    upcoming_returns = sb.table("allocations").select("id", count="exact").eq("status", "active").not_.is_("expected_return_date", "null").execute()

    # Overdue allocations
    from datetime import datetime
    today = datetime.utcnow().date().isoformat()
    overdue = sb.table("allocations").select(
        "*, asset:assets(id, tag, name), allocated_to_profile:profiles!allocations_allocated_to_fkey(id, full_name)"
    ).eq("status", "active").lt("expected_return_date", today).execute()

    # Recent activity
    recent = sb.table("activity_logs").select("*").order("created_at", desc=True).limit(10).execute()

    return {
        "kpi": {
            "available": status_counts.get("available", 0),
            "allocated": status_counts.get("allocated", 0),
            "under_maintenance": status_counts.get("under_maintenance", 0),
            "active_bookings": active_bookings.count if active_bookings.count else 0,
            "pending_transfers": pending_transfers.count if pending_transfers.count else 0,
            "upcoming_returns": upcoming_returns.count if upcoming_returns.count else 0,
            "total_assets": len(all_assets.data)
        },
        "overdue_returns": overdue.data,
        "recent_activity": recent.data
    }


@router.get("/utilization")
def get_utilization_by_department(authorization: str = Header(None)):
    """Utilization data by department (for bar chart)."""
    user = get_current_user(authorization)
    sb = get_supabase()

    departments = sb.table("departments").select("id, name").eq("status", "active").execute()
    data = []
    for dept in departments.data:
        total = sb.table("assets").select("id", count="exact").eq("department_id", dept["id"]).execute()
        allocated = sb.table("assets").select("id", count="exact").eq("department_id", dept["id"]).eq("status", "allocated").execute()
        data.append({
            "department": dept["name"],
            "total": total.count or 0,
            "allocated": allocated.count or 0,
            "utilization": round((allocated.count or 0) / max(total.count or 1, 1) * 100, 1)
        })

    return {"utilization": data}


@router.get("/maintenance-frequency")
def get_maintenance_frequency(authorization: str = Header(None)):
    """Maintenance frequency over time (for line chart)."""
    user = get_current_user(authorization)
    sb = get_supabase()

    requests = sb.table("maintenance_requests").select("created_at, status").order("created_at").execute()

    # Group by month
    from collections import defaultdict
    monthly = defaultdict(int)
    for req in requests.data:
        month = req["created_at"][:7]  # YYYY-MM
        monthly[month] += 1

    data = [{"month": k, "count": v} for k, v in sorted(monthly.items())]
    return {"frequency": data}


@router.get("/most-used")
def get_most_used_assets(authorization: str = Header(None)):
    """Most used assets by booking count."""
    user = get_current_user(authorization)
    sb = get_supabase()

    # Count bookings per asset
    bookings = sb.table("bookings").select("asset_id, asset:assets(id, tag, name)").execute()

    from collections import Counter
    counts = Counter(b["asset_id"] for b in bookings.data)
    asset_names = {b["asset_id"]: b.get("asset", {}) for b in bookings.data}

    most_used = [
        {
            "asset_id": asset_id,
            "tag": asset_names.get(asset_id, {}).get("tag", ""),
            "name": asset_names.get(asset_id, {}).get("name", ""),
            "usage_count": count
        }
        for asset_id, count in counts.most_common(10)
    ]

    return {"most_used": most_used}


@router.get("/idle")
def get_idle_assets(authorization: str = Header(None)):
    """Assets that haven't been used recently."""
    user = get_current_user(authorization)
    sb = get_supabase()

    from datetime import datetime, timedelta
    threshold = (datetime.utcnow() - timedelta(days=30)).isoformat()

    # Assets that are available and haven't had recent allocations or bookings
    available = sb.table("assets").select("id, tag, name, location, updated_at").eq("status", "available").lt("updated_at", threshold).execute()

    return {"idle_assets": available.data}


@router.get("/due-maintenance")
def get_due_maintenance(authorization: str = Header(None)):
    """Assets due for maintenance or nearing retirement."""
    user = get_current_user(authorization)
    sb = get_supabase()

    from datetime import datetime, timedelta

    # Assets with warranty expiring within 30 days
    threshold = (datetime.utcnow() + timedelta(days=30)).date().isoformat()
    today = datetime.utcnow().date().isoformat()

    nearing_warranty = sb.table("assets").select("id, tag, name, warranty_expiry, acquisition_date").not_.is_("warranty_expiry", "null").lte("warranty_expiry", threshold).gte("warranty_expiry", today).execute()

    # Assets in poor/damaged condition
    poor_condition = sb.table("assets").select("id, tag, name, condition").in_("condition", ["poor", "damaged"]).execute()

    return {
        "nearing_warranty_expiry": nearing_warranty.data,
        "poor_condition": poor_condition.data
    }
