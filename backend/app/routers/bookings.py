from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.config import get_supabase
from app.routers.auth import get_current_user

router = APIRouter()


class BookingCreate(BaseModel):
    asset_id: str
    title: Optional[str] = None
    start_time: str  # ISO format
    end_time: str    # ISO format
    notes: Optional[str] = None


class BookingReschedule(BaseModel):
    start_time: str
    end_time: str


@router.get("")
def list_bookings(
    asset_id: Optional[str] = None,
    status: Optional[str] = None,
    date: Optional[str] = None,
    authorization: str = Header(None)
):
    """List bookings with optional filters."""
    user = get_current_user(authorization)
    sb = get_supabase()

    query = sb.table("bookings").select(
        "*, asset:assets(id, tag, name), booked_by_profile:profiles!bookings_booked_by_fkey(id, full_name)"
    )

    if asset_id:
        query = query.eq("asset_id", asset_id)
    if status:
        query = query.eq("status", status)
    if date:
        query = query.gte("start_time", f"{date}T00:00:00").lte("start_time", f"{date}T23:59:59")

    result = query.order("start_time").execute()
    return {"bookings": result.data}


@router.get("/resource/{asset_id}")
def get_resource_bookings(asset_id: str, date: Optional[str] = None, authorization: str = Header(None)):
    """Get all bookings for a specific resource (for calendar view)."""
    user = get_current_user(authorization)
    sb = get_supabase()

    query = sb.table("bookings").select(
        "*, booked_by_profile:profiles!bookings_booked_by_fkey(id, full_name)"
    ).eq("asset_id", asset_id).in_("status", ["upcoming", "ongoing"])

    if date:
        query = query.gte("start_time", f"{date}T00:00:00").lte("start_time", f"{date}T23:59:59")

    result = query.order("start_time").execute()

    # Also get the asset info
    asset = sb.table("assets").select("id, tag, name").eq("id", asset_id).single().execute()

    return {"bookings": result.data, "asset": asset.data}


@router.post("")
def create_booking(booking: BookingCreate, authorization: str = Header(None)):
    """
    ⭐ SIGNATURE FEATURE: Book a time slot for a shared resource.
    Overlapping bookings are REJECTED with a clear reason.
    Edge case: booking starting exactly when another ends is ALLOWED.
    """
    user = get_current_user(authorization)
    sb = get_supabase()

    # Validate times
    try:
        start = datetime.fromisoformat(booking.start_time.replace('Z', '+00:00'))
        end = datetime.fromisoformat(booking.end_time.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid datetime format. Use ISO format.")

    if end <= start:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    # Verify the asset is bookable
    asset = sb.table("assets").select("id, tag, name, is_bookable").eq("id", booking.asset_id).single().execute()
    if not asset.data:
        raise HTTPException(status_code=404, detail="Asset not found")
    if not asset.data.get("is_bookable"):
        raise HTTPException(status_code=400, detail="This asset is not available for booking")

    # ⭐ OVERLAP VALIDATION
    # Check: existing.start < new.end AND existing.end > new.start (strict inequality)
    # This means: booking starting exactly when another ends is ALLOWED
    existing = sb.table("bookings").select("*").eq(
        "asset_id", booking.asset_id
    ).in_(
        "status", ["upcoming", "ongoing"]
    ).lt(
        "start_time", booking.end_time
    ).gt(
        "end_time", booking.start_time
    ).execute()

    if existing.data:
        conflict = existing.data[0]
        conflict_start = conflict["start_time"][:16].replace("T", " ")
        conflict_end = conflict["end_time"][:16].replace("T", " ")
        req_start = booking.start_time[:16].replace("T", " ")
        req_end = booking.end_time[:16].replace("T", " ")

        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Requested {req_start} to {req_end} — conflict — slot is unavailable",
                "conflicting_booking": {
                    "id": conflict["id"],
                    "start_time": conflict["start_time"],
                    "end_time": conflict["end_time"],
                    "booked_by": conflict.get("booked_by", "")
                }
            }
        )

    # No conflict — create booking
    data = {
        "asset_id": booking.asset_id,
        "booked_by": user["id"],
        "title": booking.title,
        "start_time": booking.start_time,
        "end_time": booking.end_time,
        "status": "upcoming",
        "notes": booking.notes
    }

    result = sb.table("bookings").insert(data).execute()

    # Notification
    sb.table("notifications").insert({
        "user_id": user["id"],
        "type": "booking",
        "title": f"Booking confirmed: {asset.data.get('name', '')}",
        "message": f"Your booking for {asset.data.get('name', '')} has been confirmed.",
        "entity_type": "booking",
        "entity_id": result.data[0]["id"]
    }).execute()

    # Log
    sb.table("activity_logs").insert({
        "user_id": user["id"],
        "user_name": user.get("full_name", ""),
        "action": f"Booked {asset.data.get('name', '')} ({asset.data.get('tag', '')})",
        "entity_type": "booking",
        "entity_id": result.data[0]["id"]
    }).execute()

    return {"booking": result.data[0], "message": "Booking confirmed"}


@router.put("/{booking_id}/cancel")
def cancel_booking(booking_id: str, authorization: str = Header(None)):
    """Cancel a booking."""
    user = get_current_user(authorization)
    sb = get_supabase()

    result = sb.table("bookings").update({"status": "cancelled"}).eq("id", booking_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Booking not found")

    return {"message": "Booking cancelled"}


@router.put("/{booking_id}/reschedule")
def reschedule_booking(booking_id: str, req: BookingReschedule, authorization: str = Header(None)):
    """Reschedule a booking (re-validates overlap)."""
    user = get_current_user(authorization)
    sb = get_supabase()

    booking = sb.table("bookings").select("*").eq("id", booking_id).single().execute()
    if not booking.data:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Check for overlaps (excluding this booking)
    existing = sb.table("bookings").select("*").eq(
        "asset_id", booking.data["asset_id"]
    ).neq(
        "id", booking_id
    ).in_(
        "status", ["upcoming", "ongoing"]
    ).lt(
        "start_time", req.end_time
    ).gt(
        "end_time", req.start_time
    ).execute()

    if existing.data:
        raise HTTPException(
            status_code=409,
            detail={"message": "Rescheduled time conflicts with an existing booking"}
        )

    result = sb.table("bookings").update({
        "start_time": req.start_time,
        "end_time": req.end_time
    }).eq("id", booking_id).execute()

    return {"booking": result.data[0], "message": "Booking rescheduled"}
