from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import FRONTEND_URL

from app.routers import auth, departments, employees, categories, assets, allocations, bookings, maintenance, audits, reports, notifications

app = FastAPI(
    title="AssetFlow API",
    description="Enterprise Asset & Resource Management System",
    version="1.0.0"
)

# CORS - allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(departments.router, prefix="/api/departments", tags=["Departments"])
app.include_router(employees.router, prefix="/api/employees", tags=["Employees"])
app.include_router(categories.router, prefix="/api/categories", tags=["Asset Categories"])
app.include_router(assets.router, prefix="/api/assets", tags=["Assets"])
app.include_router(allocations.router, prefix="/api/allocations", tags=["Allocations & Transfers"])
app.include_router(bookings.router, prefix="/api/bookings", tags=["Resource Bookings"])
app.include_router(maintenance.router, prefix="/api/maintenance", tags=["Maintenance"])
app.include_router(audits.router, prefix="/api/audits", tags=["Audit"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports & Analytics"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications & Activity Logs"])


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "AssetFlow API"}
