-- ============================================================
-- AssetFlow: Enterprise Asset & Resource Management System
-- Full Database Schema Migration
-- ============================================================

-- ==================== ENUMS ====================

CREATE TYPE user_role AS ENUM ('employee', 'department_head', 'asset_manager', 'admin');
CREATE TYPE department_status AS ENUM ('active', 'inactive');
CREATE TYPE asset_status AS ENUM ('available', 'allocated', 'under_maintenance', 'retired', 'lost');
CREATE TYPE asset_condition AS ENUM ('new', 'good', 'fair', 'poor', 'damaged');
CREATE TYPE allocation_status AS ENUM ('active', 'returned', 'overdue');
CREATE TYPE transfer_status AS ENUM ('requested', 'approved', 'rejected', 'completed');
CREATE TYPE booking_status AS ENUM ('upcoming', 'ongoing', 'completed', 'cancelled');
CREATE TYPE maintenance_status AS ENUM ('pending', 'approved', 'technician_assigned', 'in_progress', 'resolved', 'rejected');
CREATE TYPE maintenance_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE audit_cycle_status AS ENUM ('open', 'closed');
CREATE TYPE audit_item_verification AS ENUM ('pending', 'verified', 'missing', 'damaged');
CREATE TYPE notification_type AS ENUM ('allocation', 'transfer', 'booking', 'maintenance', 'audit', 'alert', 'approval');

-- ==================== TABLES ====================

-- 1. Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role user_role NOT NULL DEFAULT 'employee',
    department_id UUID,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Departments
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    head_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    status department_status NOT NULL DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK for profiles.department_id after departments table exists
ALTER TABLE profiles ADD CONSTRAINT fk_profiles_department
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

-- 3. Asset Categories
CREATE TABLE asset_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    custom_fields JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Assets (core entity)
-- Sequence for auto-generating asset tags AF-0001, AF-0002, etc.
CREATE SEQUENCE asset_tag_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag TEXT NOT NULL UNIQUE DEFAULT 'AF-' || LPAD(nextval('asset_tag_seq')::TEXT, 4, '0'),
    name TEXT NOT NULL,
    category_id UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
    serial_number TEXT,
    status asset_status NOT NULL DEFAULT 'available',
    condition asset_condition NOT NULL DEFAULT 'new',
    location TEXT,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    is_bookable BOOLEAN NOT NULL DEFAULT FALSE,
    acquisition_date DATE,
    acquisition_cost NUMERIC(12, 2),
    warranty_expiry DATE,
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Allocations
CREATE TABLE allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    allocated_to UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    allocated_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expected_return_date DATE,
    actual_return_date DATE,
    status allocation_status NOT NULL DEFAULT 'active',
    condition_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ⭐ Critical: Only ONE active allocation per asset at a time
CREATE UNIQUE INDEX idx_one_active_allocation_per_asset
    ON allocations (asset_id)
    WHERE status = 'active';

-- 6. Transfer Requests
CREATE TABLE transfer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    from_employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    to_employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reason TEXT,
    status transfer_status NOT NULL DEFAULT 'requested',
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Bookings (for shared/bookable resources)
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    booked_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status booking_status NOT NULL DEFAULT 'upcoming',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_booking_times CHECK (end_time > start_time)
);

-- ⭐ Critical: Prevent overlapping bookings for the same asset
-- This function checks for overlaps (start < end AND end > start, strict inequality)
CREATE OR REPLACE FUNCTION check_booking_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM bookings
        WHERE asset_id = NEW.asset_id
          AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND status NOT IN ('cancelled', 'completed')
          AND start_time < NEW.end_time
          AND end_time > NEW.start_time
    ) THEN
        RAISE EXCEPTION 'Booking conflict: the requested time slot overlaps with an existing booking';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_booking_overlap
    BEFORE INSERT OR UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION check_booking_overlap();

-- 8. Maintenance Requests
CREATE TABLE maintenance_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    raised_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    issue_description TEXT NOT NULL,
    priority maintenance_priority NOT NULL DEFAULT 'medium',
    status maintenance_status NOT NULL DEFAULT 'pending',
    technician_name TEXT,
    technician_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    photo_url TEXT,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Audit Cycles
CREATE TABLE audit_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    location TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status audit_cycle_status NOT NULL DEFAULT 'open',
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_audit_dates CHECK (end_date >= start_date)
);

-- 10. Audit Assignments (auditors assigned to a cycle)
CREATE TABLE audit_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_cycle_id UUID NOT NULL REFERENCES audit_cycles(id) ON DELETE CASCADE,
    auditor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(audit_cycle_id, auditor_id)
);

-- 11. Audit Items (per-asset verification within a cycle)
CREATE TABLE audit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_cycle_id UUID NOT NULL REFERENCES audit_cycles(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    expected_location TEXT,
    verification_status audit_item_verification NOT NULL DEFAULT 'pending',
    notes TEXT,
    verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(audit_cycle_id, asset_id)
);

-- 12. Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type notification_type NOT NULL DEFAULT 'alert',
    title TEXT NOT NULL,
    message TEXT,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    entity_type TEXT,
    entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Activity Logs (full audit trail)
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    user_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== INDEXES ====================

CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_category ON assets(category_id);
CREATE INDEX idx_assets_department ON assets(department_id);
CREATE INDEX idx_assets_tag ON assets(tag);
CREATE INDEX idx_allocations_asset ON allocations(asset_id);
CREATE INDEX idx_allocations_employee ON allocations(allocated_to);
CREATE INDEX idx_allocations_status ON allocations(status);
CREATE INDEX idx_bookings_asset ON bookings(asset_id);
CREATE INDEX idx_bookings_times ON bookings(asset_id, start_time, end_time);
CREATE INDEX idx_maintenance_asset ON maintenance_requests(asset_id);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX idx_audit_items_cycle ON audit_items(audit_cycle_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, read);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_time ON activity_logs(created_at DESC);

-- ==================== FUNCTIONS ====================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with updated_at column
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_asset_categories_updated_at BEFORE UPDATE ON asset_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_allocations_updated_at BEFORE UPDATE ON allocations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transfer_requests_updated_at BEFORE UPDATE ON transfer_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_maintenance_requests_updated_at BEFORE UPDATE ON maintenance_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_audit_cycles_updated_at BEFORE UPDATE ON audit_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_audit_items_updated_at BEFORE UPDATE ON audit_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- For the hackathon demo, allow authenticated users to read/write all tables
-- In production, these would be role-scoped policies

CREATE POLICY "Allow all for authenticated users" ON profiles
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON departments
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON asset_categories
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON assets
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON allocations
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON transfer_requests
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON bookings
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON maintenance_requests
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON audit_cycles
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON audit_assignments
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON audit_items
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON notifications
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON activity_logs
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ==================== AUTH TRIGGER ====================
-- Auto-create a profile row when a new user signs up via Supabase Auth

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        'employee'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
