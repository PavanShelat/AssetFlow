from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from app.config import get_supabase
from app.routers.auth import get_current_user

router = APIRouter()


@router.get("")
def list_notifications(
    type: Optional[str] = None,
    unread_only: bool = False,
    authorization: str = Header(None)
):
    """List notifications for the current user, with optional type filter."""
    user = get_current_user(authorization)
    sb = get_supabase()

    query = sb.table("notifications").select("*").eq("user_id", user["id"])

    if type and type != "all":
        # Map filter categories to notification types
        type_map = {
            "alerts": ["alert"],
            "approvals": ["approval", "transfer", "maintenance"],
            "bookings": ["booking"],
            "allocations": ["allocation"]
        }
        types = type_map.get(type, [type])
        query = query.in_("type", types)

    if unread_only:
        query = query.eq("read", False)

    result = query.order("created_at", desc=True).limit(50).execute()
    return {"notifications": result.data}


@router.get("/count")
def get_unread_count(authorization: str = Header(None)):
    """Get unread notification count."""
    user = get_current_user(authorization)
    sb = get_supabase()

    result = sb.table("notifications").select("id", count="exact").eq("user_id", user["id"]).eq("read", False).execute()
    return {"unread_count": result.count or 0}


@router.put("/{notification_id}/read")
def mark_read(notification_id: str, authorization: str = Header(None)):
    """Mark a notification as read."""
    user = get_current_user(authorization)
    sb = get_supabase()

    sb.table("notifications").update({"read": True}).eq("id", notification_id).execute()
    return {"message": "Marked as read"}


@router.put("/read-all")
def mark_all_read(authorization: str = Header(None)):
    """Mark all notifications as read."""
    user = get_current_user(authorization)
    sb = get_supabase()

    sb.table("notifications").update({"read": True}).eq("user_id", user["id"]).eq("read", False).execute()
    return {"message": "All notifications marked as read"}


@router.get("/activity-logs")
def get_activity_logs(
    entity_type: Optional[str] = None,
    limit: int = 50,
    authorization: str = Header(None)
):
    """Get activity log entries."""
    user = get_current_user(authorization)
    sb = get_supabase()

    query = sb.table("activity_logs").select("*")

    if entity_type:
        query = query.eq("entity_type", entity_type)

    result = query.order("created_at", desc=True).limit(limit).execute()
    return {"logs": result.data}
