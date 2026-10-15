--
-- PostgreSQL database dump
--

\restrict i8w8Zzr62W9VUxhYtlPlaKIThQCJguVQ0ZtFcehzKj6FlMSBbPISzLa1StyHyzM

-- Dumped from database version 16.11 (Debian 16.11-1.pgdg13+1)
-- Dumped by pg_dump version 16.11 (Debian 16.11-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_feed; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_feed (
    id character varying(64) NOT NULL,
    type character varying(64) NOT NULL,
    title character varying(255) NOT NULL,
    subtitle text DEFAULT ''::text NOT NULL,
    "user" character varying(180) DEFAULT ''::character varying NOT NULL,
    "timestamp" timestamp without time zone,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: availability_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability_requests (
    id character varying(64) NOT NULL,
    worker_id character varying(64) NOT NULL,
    date date NOT NULL,
    end_date date,
    type character varying(32) NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    start_time character varying(16) DEFAULT '00:00'::character varying NOT NULL,
    end_time character varying(16) DEFAULT '23:59'::character varying NOT NULL,
    reviewed_by character varying(64),
    reviewed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: certifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certifications (
    id character varying(64) NOT NULL,
    name character varying(180) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(24) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    document_url text
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id character varying(64) NOT NULL,
    name character varying(255) NOT NULL,
    contact_name character varying(180) DEFAULT ''::character varying NOT NULL,
    email character varying(255) DEFAULT ''::character varying NOT NULL,
    phone character varying(64) DEFAULT ''::character varying NOT NULL,
    website character varying(255) DEFAULT ''::character varying NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    status character varying(32) NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    city character varying(180) DEFAULT ''::character varying NOT NULL,
    state character varying(120) DEFAULT ''::character varying NOT NULL,
    zip_code character varying(32) DEFAULT ''::character varying NOT NULL,
    latitude double precision,
    longitude double precision,
    country character varying(120) DEFAULT 'USA'::character varying NOT NULL
);


--
-- Name: commercial_catalog_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commercial_catalog_items (
    id character varying(64) NOT NULL,
    sku character varying(80) NOT NULL,
    description character varying(255) NOT NULL,
    type character varying(80) DEFAULT ''::character varying NOT NULL,
    daily_rate numeric(12,2) DEFAULT 0 NOT NULL,
    unit character varying(40) DEFAULT 'Each'::character varying NOT NULL,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    item_price numeric(12,2) DEFAULT 0 NOT NULL
);


--
-- Name: commercial_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commercial_invoices (
    id character varying(64) NOT NULL,
    invoice_number character varying(80) NOT NULL,
    commercial_work_order_id character varying(64) NOT NULL,
    work_order_number character varying(80) NOT NULL,
    customer_name character varying(255) DEFAULT ''::character varying NOT NULL,
    job_name character varying(255) DEFAULT ''::character varying NOT NULL,
    contact character varying(180) DEFAULT ''::character varying NOT NULL,
    email character varying(255) DEFAULT ''::character varying NOT NULL,
    billing_date date NOT NULL,
    next_invoice_date date NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    status character varying(32) DEFAULT 'generated'::character varying NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by character varying(180) DEFAULT ''::character varying NOT NULL,
    pdf_html text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: commercial_work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commercial_work_orders (
    id character varying(64) NOT NULL,
    work_order_number character varying(80) NOT NULL,
    type character varying(24) NOT NULL,
    status character varying(32) NOT NULL,
    parent_work_order_id character varying(64),
    rollover_index integer DEFAULT 0 NOT NULL,
    job_number character varying(120) DEFAULT ''::character varying NOT NULL,
    job_name character varying(255) DEFAULT ''::character varying NOT NULL,
    project_id character varying(64) DEFAULT ''::character varying NOT NULL,
    customer_id character varying(64) DEFAULT ''::character varying NOT NULL,
    customer_name character varying(255) DEFAULT ''::character varying NOT NULL,
    contact character varying(180) DEFAULT ''::character varying NOT NULL,
    phone character varying(64) DEFAULT ''::character varying NOT NULL,
    email character varying(255) DEFAULT ''::character varying NOT NULL,
    customer_order_number character varying(120) DEFAULT ''::character varying NOT NULL,
    description_of_work text DEFAULT ''::text NOT NULL,
    work_date date,
    on_rent_date date,
    original_on_rent_date date,
    previous_billing_date date,
    next_invoice_date date,
    off_rent_date date,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_by character varying(180) DEFAULT ''::character varying NOT NULL,
    pdf_html text DEFAULT ''::text NOT NULL,
    pdf_generated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    id character varying(64) NOT NULL,
    name character varying(255) NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    phone character varying(64) DEFAULT ''::character varying NOT NULL,
    email character varying(255) DEFAULT ''::character varying NOT NULL,
    logo text,
    overtime_rules jsonb,
    worker_types text[] DEFAULT '{}'::text[] NOT NULL,
    equipment_types text[] DEFAULT '{}'::text[] NOT NULL,
    material_types text[] DEFAULT '{}'::text[] NOT NULL,
    job_statuses text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    assignment_auto_status jsonb,
    minimum_rest_hours numeric(4,1) DEFAULT 8 NOT NULL,
    logo_icon text,
    work_order_number_prefix character varying(16) DEFAULT 'ASN'::character varying NOT NULL,
    work_order_number_padding integer DEFAULT 4 NOT NULL,
    work_order_number_reset character varying(16) DEFAULT 'yearly'::character varying NOT NULL,
    work_order_number_template character varying(64) DEFAULT '{PREFIX}-{YYYY}-{NNNN}'::character varying NOT NULL,
    work_order_type_options text[] DEFAULT '{}'::text[] NOT NULL,
    work_order_pdf_builder jsonb
);


--
-- Name: equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment (
    id character varying(64) NOT NULL,
    name character varying(180) NOT NULL,
    type character varying(120) NOT NULL,
    identifier character varying(120) DEFAULT ''::character varying NOT NULL,
    brand character varying(120) DEFAULT ''::character varying NOT NULL,
    status character varying(32) NOT NULL,
    last_maintenance date,
    next_maintenance date,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone
);


--
-- Name: form_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_submissions (
    id character varying(64) NOT NULL,
    template_id character varying(64) DEFAULT ''::character varying NOT NULL,
    project_id character varying(64) DEFAULT ''::character varying NOT NULL,
    worker_id character varying(64) DEFAULT ''::character varying NOT NULL,
    submitted_at timestamp without time zone,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(32) NOT NULL,
    pdf_url text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    work_order_id character varying(64) DEFAULT ''::character varying NOT NULL,
    shift_id character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: form_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_templates (
    id character varying(64) NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    category character varying(120) DEFAULT 'Safety'::character varying NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    assigned_projects text[] DEFAULT '{}'::text[] NOT NULL,
    assigned_roles text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidents (
    id character varying(64) NOT NULL,
    project_id character varying(64) DEFAULT ''::character varying NOT NULL,
    reported_by character varying(180) DEFAULT ''::character varying NOT NULL,
    date date NOT NULL,
    severity character varying(32) NOT NULL,
    status character varying(32) NOT NULL,
    title character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    photos text[] DEFAULT '{}'::text[] NOT NULL,
    actions text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id character varying(64) NOT NULL,
    name character varying(180) NOT NULL,
    type character varying(120) NOT NULL,
    identifier character varying(120) DEFAULT ''::character varying NOT NULL,
    brand character varying(120) DEFAULT ''::character varying NOT NULL,
    status character varying(32) NOT NULL,
    last_maintenance date,
    next_maintenance date,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    price numeric(12,2) DEFAULT 0 NOT NULL,
    deleted_at timestamp without time zone
);


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id character varying(64) NOT NULL,
    type character varying(32) NOT NULL,
    title character varying(255) NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    "timestamp" timestamp without time zone,
    read boolean DEFAULT false NOT NULL,
    link character varying(64),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    channel character varying(32) DEFAULT 'in_app'::character varying NOT NULL,
    worker_id character varying(64),
    work_order_id character varying(64),
    shift_id character varying(64),
    role_id character varying(64),
    delivery_status character varying(64),
    provider_message_id text
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    key character varying NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: project_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_types (
    id character varying(64) NOT NULL,
    name character varying(180) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(24) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id character varying(64) NOT NULL,
    number character varying(80) DEFAULT ''::character varying NOT NULL,
    name character varying(255) NOT NULL,
    client_id character varying(64) DEFAULT ''::character varying NOT NULL,
    project_type_id character varying(64) DEFAULT ''::character varying NOT NULL,
    project_manager character varying(180) DEFAULT ''::character varying NOT NULL,
    project_manager_email character varying(255) DEFAULT ''::character varying NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    city character varying(120) DEFAULT ''::character varying NOT NULL,
    status character varying(32) NOT NULL,
    start_date date,
    end_date date,
    work_order_number character varying(120),
    purchase_order character varying(120),
    description text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    state character varying(120) DEFAULT ''::character varying NOT NULL,
    zip_code character varying(32) DEFAULT ''::character varying NOT NULL,
    latitude double precision,
    longitude double precision,
    country character varying(120) DEFAULT 'USA'::character varying NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    key character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: shift_assignment_confirmations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_assignment_confirmations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    work_order_id character varying(64) NOT NULL,
    shift_id character varying(64) NOT NULL,
    role_id character varying(64) NOT NULL,
    worker_id character varying(64) NOT NULL,
    token character varying(160) NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    delivery_channel character varying(32),
    requested_at timestamp without time zone,
    responded_at timestamp without time zone,
    last_message text DEFAULT ''::text NOT NULL,
    last_sent_to character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    provider_message_sid character varying(64),
    delivery_status character varying(32),
    delivery_error text,
    delivered_at timestamp without time zone
);


--
-- Name: shift_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_chat_messages (
    id character varying(64) NOT NULL,
    work_order_id character varying(64) NOT NULL,
    shift_id character varying(64) NOT NULL,
    sender_user_id character varying(64) DEFAULT ''::character varying NOT NULL,
    sender_worker_id character varying(64) NOT NULL,
    sender_name character varying(180) NOT NULL,
    kind character varying(16) DEFAULT 'text'::character varying NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    media_url text DEFAULT ''::text NOT NULL,
    media_name character varying(240) DEFAULT ''::character varying NOT NULL,
    media_content_type character varying(120) DEFAULT ''::character varying NOT NULL,
    media_size integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    reply_to_message_id character varying(64) DEFAULT ''::character varying NOT NULL,
    reply_to_sender_name character varying(180) DEFAULT ''::character varying NOT NULL,
    reply_to_kind character varying(16) DEFAULT ''::character varying NOT NULL,
    reply_to_preview character varying(280) DEFAULT ''::character varying NOT NULL
);


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id character varying(64) NOT NULL,
    name character varying(180) NOT NULL,
    type character varying(40) DEFAULT 'standard'::character varying NOT NULL,
    start_time character varying(5),
    end_time character varying(5),
    duration_hours double precision,
    status character varying(24) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id character varying(64) NOT NULL,
    name character varying(180) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(24) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: status_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.status_catalog (
    id character varying(64) NOT NULL,
    scope character varying(32) NOT NULL,
    value character varying(64) NOT NULL,
    name character varying(180) NOT NULL,
    color character varying(16) DEFAULT '#94A3B8'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    blocks_editing boolean DEFAULT false NOT NULL,
    triggers_notification boolean DEFAULT false NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    status character varying(24) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    automatic boolean DEFAULT false NOT NULL
);


--
-- Name: timesheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheets (
    id character varying(64) NOT NULL,
    worker_id character varying(64) DEFAULT ''::character varying NOT NULL,
    project_id character varying(64) DEFAULT ''::character varying NOT NULL,
    work_order_id character varying(64) DEFAULT ''::character varying NOT NULL,
    date date NOT NULL,
    clock_in character varying(16) DEFAULT ''::character varying NOT NULL,
    clock_out character varying(16) DEFAULT ''::character varying NOT NULL,
    break_minutes integer DEFAULT 0 NOT NULL,
    regular_hours numeric(8,2) DEFAULT 0 NOT NULL,
    overtime_hours numeric(8,2) DEFAULT 0 NOT NULL,
    double_time_hours numeric(8,2) DEFAULT 0 NOT NULL,
    status character varying(32) NOT NULL,
    approved_by character varying(180) DEFAULT ''::character varying NOT NULL,
    rejected_reason text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    shift_id character varying(64) DEFAULT ''::character varying NOT NULL,
    lunch_taken boolean DEFAULT false NOT NULL,
    employee_note text DEFAULT ''::text NOT NULL,
    signature text DEFAULT ''::text NOT NULL,
    variant character varying(16) DEFAULT 'internal'::character varying NOT NULL,
    source_submission_id character varying(64),
    manually_edited boolean DEFAULT false NOT NULL,
    CONSTRAINT "CHK_timesheets_variant" CHECK (((variant)::text = ANY ((ARRAY['client'::character varying, 'internal'::character varying])::text[])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying NOT NULL,
    password_hash character varying NOT NULL,
    first_name character varying(120) DEFAULT ''::character varying NOT NULL,
    last_name character varying(120) DEFAULT ''::character varying NOT NULL,
    phone character varying(64) DEFAULT ''::character varying NOT NULL,
    avatar_url text,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    last_login timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: work_order_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order_sequences (
    scope character varying(32) NOT NULL,
    last_value integer DEFAULT 0 NOT NULL,
    reset_key character varying(16) NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: work_order_shift_role_workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order_shift_role_workers (
    role_id character varying(64) NOT NULL,
    worker_id character varying(64) NOT NULL,
    confirmation_status character varying(24) DEFAULT 'pending'::character varying NOT NULL,
    requested_at timestamp with time zone,
    responded_at timestamp with time zone,
    notification_channel character varying(24),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: work_order_shift_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order_shift_roles (
    id character varying(64) NOT NULL,
    shift_id character varying(64) NOT NULL,
    role_name character varying(180) NOT NULL,
    required_count integer DEFAULT 1 NOT NULL,
    start_time character varying(16),
    required_certification_ids text[] DEFAULT '{}'::text[] NOT NULL,
    required_skill_ids text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: work_order_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order_shifts (
    id character varying(64) NOT NULL,
    work_order_id character varying(64) NOT NULL,
    date date NOT NULL,
    start_time character varying(16) DEFAULT ''::character varying NOT NULL,
    end_time character varying(16) DEFAULT ''::character varying NOT NULL,
    default_role_start_time character varying(16),
    shift_template_id character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(64),
    created_by_user_id uuid,
    requester_user_id uuid,
    address text,
    address_latitude double precision,
    address_longitude double precision,
    address_city character varying(120),
    address_state character varying(120),
    address_zip_code character varying(32),
    address_country character varying(120),
    requester_name character varying(200),
    visible_document_types jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    cancelled boolean DEFAULT false NOT NULL,
    cross_street_location_detail text,
    planned_equipment jsonb DEFAULT '[]'::jsonb NOT NULL,
    planned_materials jsonb DEFAULT '[]'::jsonb NOT NULL,
    requester_phone character varying(64),
    requester_email character varying(255),
    shift_name character varying(180) NOT NULL,
    work_order_authorized_worker_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    work_order_types jsonb DEFAULT '[]'::jsonb NOT NULL,
    client_timesheet_notes text DEFAULT ''::text NOT NULL,
    internal_timesheet_notes text DEFAULT ''::text NOT NULL,
    pm_approved_at timestamp without time zone,
    pm_approved_by_user_id uuid,
    confirmation_reset_reason character varying(32),
    display_order integer DEFAULT 0 NOT NULL,
    form_template_ids text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: work_order_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order_types (
    id character varying(64) NOT NULL,
    name character varying(180) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(24) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_orders (
    id character varying(64) NOT NULL,
    project_id character varying(64) DEFAULT ''::character varying NOT NULL,
    work_order_type_id character varying(64),
    title character varying(255) NOT NULL,
    order_number character varying(120),
    status character varying(32) NOT NULL,
    start_date date,
    end_date date,
    requester_name character varying(180) DEFAULT ''::character varying NOT NULL,
    contact_email character varying(255) DEFAULT ''::character varying NOT NULL,
    contact_phone_number character varying(64) DEFAULT ''::character varying NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    dispatch_note text DEFAULT ''::text NOT NULL,
    file_uploads text[] DEFAULT '{}'::text[] NOT NULL,
    attachments text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    assignment_address text DEFAULT ''::text NOT NULL,
    latitude double precision,
    longitude double precision,
    assignment_city character varying(180) DEFAULT ''::character varying NOT NULL,
    assignment_state character varying(120) DEFAULT ''::character varying NOT NULL,
    assignment_zip_code character varying(32) DEFAULT ''::character varying NOT NULL,
    assignment_country character varying(120) DEFAULT 'USA'::character varying NOT NULL,
    deleted_at timestamp without time zone
);


--
-- Name: worker_certifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_certifications (
    worker_id character varying(64) NOT NULL,
    certification_id character varying(64) NOT NULL,
    expiration_date date
);


--
-- Name: worker_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_roles (
    id character varying(64) NOT NULL,
    name character varying(180) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(24) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: worker_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_skills (
    worker_id character varying(64) NOT NULL,
    skill_id character varying(64) NOT NULL
);


--
-- Name: worker_worker_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_worker_roles (
    worker_id character varying(64) NOT NULL,
    worker_role_id character varying(64) NOT NULL
);


--
-- Name: workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workers (
    id character varying(64) NOT NULL,
    first_name character varying(120) NOT NULL,
    last_name character varying(120) NOT NULL,
    email character varying(255) DEFAULT ''::character varying NOT NULL,
    phone character varying(64) DEFAULT ''::character varying NOT NULL,
    driver_license character varying(120) DEFAULT ''::character varying NOT NULL,
    primary_address text DEFAULT ''::text NOT NULL,
    city character varying(120) DEFAULT ''::character varying NOT NULL,
    zip_code character varying(32) DEFAULT ''::character varying NOT NULL,
    state character varying(64) DEFAULT ''::character varying NOT NULL,
    type character varying(100) NOT NULL,
    role character varying(100) NOT NULL,
    status character varying(32) NOT NULL,
    file_uploads text[] DEFAULT '{}'::text[] NOT NULL,
    hire_date date,
    hourly_rate numeric(10,2) DEFAULT 0 NOT NULL,
    avatar text,
    emergency_contact text,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    latitude double precision,
    longitude double precision,
    country character varying(120) DEFAULT 'USA'::character varying NOT NULL,
    driver_license_expiration date,
    fcm_tokens text[] DEFAULT '{}'::text[] NOT NULL,
    user_id uuid
);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Data for Name: activity_feed; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.activity_feed (id, type, title, subtitle, "user", "timestamp", tags, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: availability_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.availability_requests (id, worker_id, date, end_date, type, status, reason, start_time, end_time, reviewed_by, reviewed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: certifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.certifications (id, name, description, status, created_at, updated_at, document_url) FROM stdin;
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.clients (id, name, contact_name, email, phone, website, address, status, notes, created_at, updated_at, city, state, zip_code, latitude, longitude, country) FROM stdin;
cli_demo_pge	PG&E Infrastructure Services	Michael Thompson	michael@pge.com	+14155550100			active		2026-06-22 22:23:21.060734	2026-06-22 22:23:21.060734				\N	\N	USA
\.


--
-- Data for Name: commercial_catalog_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.commercial_catalog_items (id, sku, description, type, daily_rate, unit, status, notes, created_at, updated_at, item_price) FROM stdin;
item_cone_28	CONE-28	28" Traffic Cone	Cone	1.50	Each	active		2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	0.00
item_cone_36	CONE-36	36" Traffic Cone	Cone	2.00	Each	active		2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	0.00
item_base_18	BASE-18	18" Rubber Base	Base	0.80	Each	active		2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	0.00
item_base_24	BASE-24	24" Rubber Base	Base	1.20	Each	active		2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	0.00
item_sign_rw	SIGN-RW	Road Work Sign	Sign	2.00	Each	active		2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	0.00
item_sign_det	SIGN-DET	Detour Sign	Sign	2.00	Each	active		2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	0.00
item_barr_8	BARR-8	8' Type III Barricade	Barricade	1.75	Each	active		2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	0.00
item_light_tma	LIGHT-TMA	TMA Arrow Board Light	Equipment	15.00	Each	active		2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	0.00
item_drum_18	DRUM-18	18" Traffic Drum	Drum	1.25	Each	active		2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	0.00
\.


--
-- Data for Name: commercial_invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.commercial_invoices (id, invoice_number, commercial_work_order_id, work_order_number, customer_name, job_name, contact, email, billing_date, next_invoice_date, amount, status, items, created_by, pdf_html, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: commercial_work_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.commercial_work_orders (id, work_order_number, type, status, parent_work_order_id, rollover_index, job_number, job_name, project_id, customer_id, customer_name, contact, phone, email, customer_order_number, description_of_work, work_date, on_rent_date, original_on_rent_date, previous_billing_date, next_invoice_date, off_rent_date, items, notes, created_by, pdf_html, pdf_generated_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.company_settings (id, name, address, phone, email, logo, overtime_rules, worker_types, equipment_types, material_types, job_statuses, created_at, updated_at, assignment_auto_status, minimum_rest_hours, logo_icon, work_order_number_prefix, work_order_number_padding, work_order_number_reset, work_order_number_template, work_order_type_options, work_order_pdf_builder) FROM stdin;
default	DR Traffic Control, LLC	1366 Palou Ave, Unit A, San Francisco, CA 94124	415-641-4416	info@drtrafficcontrol.com	https://drtraffic-control.nyc3.digitaloceanspaces.com/work-orders/logo/company/2026-07-01/ce72c0a3-e526-4815-8c4d-2e375160502f-drtraffic-logo-horizontal.png	{"id": "1", "name": "California Overtime", "regularHoursLimit": 8, "noLunchCreditHours": 1, "overtimeMultiplier": 1.5, "doubleTimeThreshold": 12, "noLunchCreditTarget": "ot", "doubleTimeMultiplier": 2, "noLunchCreditEnabled": true, "noLunchCreditMinimumHours": 7, "noLunchCreditEffectiveDate": "2026-07-08"}	{"Full-Time Employee","Part-Time Employee","Temporary / Seasonal",Subcontractor}	{"Arrow Board","Message Board",Truck,"Cone Set","Barricade Set","Light Tower",Generator,"CMS Mini"}	{Sign,Cone,Barricade,Drum,Sandbag,Delineator}	{Pending,Confirmed,"In Progress",Completed,Cancelled}	2026-06-22 22:23:19.328631	2026-10-15 11:16:31.808916	\N	8.0	https://drtraffic-control.nyc3.digitaloceanspaces.com/work-orders/logo/company/2026-07-01/d6ad8fd8-a7de-4cfc-8f4e-d43e652badbc-drtraffic-logo.png		6	yearly	{NNNNNN}	{}	\N
\.


--
-- Data for Name: equipment; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.equipment (id, name, type, identifier, brand, status, last_maintenance, next_maintenance, notes, created_at, updated_at, deleted_at) FROM stdin;
eq_demo_cone	Cone Set 28"	Traffic Control	CONE-28-001		available	\N	\N		2026-06-22 22:23:21.171992	2026-06-22 22:23:21.171992	\N
eq_demo_arrow	Arrow Board	Traffic Control	ARR-001		available	\N	\N		2026-06-22 22:23:21.19737	2026-06-22 22:23:21.19737	\N
\.


--
-- Data for Name: form_submissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.form_submissions (id, template_id, project_id, worker_id, submitted_at, data, status, pdf_url, created_at, updated_at, work_order_id, shift_id) FROM stdin;
qa-wo-1792062985410-before-submission	work_order_daily_completion			\N	{"_meta": {"normalizedAt": "2026-10-15T11:16:30.713Z", "contractVersion": "1.0.0"}, "notes": "TEST DOCUMENT - NOT FOR BILLING", "client": "QA TEST CLIENT", "contact": "QA", "job_name": "LOCAL API NUMBERING TEST", "work_date": "2026-10-15", "work_shift": "Day Shift", "worker_signature": {"type": "signature-path", "width": 600, "height": 220, "strokes": [[{"x": 30, "y": 130}, {"x": 100, "y": 70}, {"x": 160, "y": 130}]]}, "work_order_number": "ASN-2026-001", "worker_timesheets": [{"endTime": "16:00", "roleName": "Flagger", "workerId": "qa-wo-1792062985410-worker", "signature": {"type": "signature-path", "width": 600, "height": 220, "strokes": [[{"x": 30, "y": 130}, {"x": 100, "y": 70}, {"x": 160, "y": 130}]]}, "startTime": "08:00", "lunchTaken": true, "workerName": "QA Numbering Test", "breakMinutes": 30, "regularHours": 8, "overtimeHours": 0, "doubleTimeHours": 0}], "description_of_work": "Verify saved numbering settings through the actual API and final PDF.", "dr_traffic_job_number": "QA-API", "completion_confirmation": true}	submitted	/files/generated-form-pdfs/ASN-2026-0001.pdf	2026-10-15 11:16:30.718915	2026-10-15 11:16:30.921194	qa-wo-1792062985410-before	qa-wo-1792062985410-before-shift
qa-wo-1792062985410-after-submission	work_order_daily_completion			\N	{"_meta": {"normalizedAt": "2026-10-15T11:16:31.318Z", "contractVersion": "1.0.0"}, "notes": "TEST DOCUMENT - NOT FOR BILLING", "client": "QA TEST CLIENT", "contact": "QA", "job_name": "LOCAL API NUMBERING TEST", "work_date": "2026-10-15", "work_shift": "Day Shift", "worker_signature": {"type": "signature-path", "width": 600, "height": 220, "strokes": [[{"x": 30, "y": 130}, {"x": 100, "y": 70}, {"x": 160, "y": 130}]]}, "work_order_number": "ASN-2026-001", "worker_timesheets": [{"endTime": "16:00", "roleName": "Flagger", "workerId": "qa-wo-1792062985410-worker", "signature": {"type": "signature-path", "width": 600, "height": 220, "strokes": [[{"x": 30, "y": 130}, {"x": 100, "y": 70}, {"x": 160, "y": 130}]]}, "startTime": "08:00", "lunchTaken": true, "workerName": "QA Numbering Test", "breakMinutes": 30, "regularHours": 8, "overtimeHours": 0, "doubleTimeHours": 0}], "description_of_work": "Verify saved numbering settings through the actual API and final PDF.", "dr_traffic_job_number": "QA-API", "completion_confirmation": true}	submitted	/files/generated-form-pdfs/000002.pdf	2026-10-15 11:16:31.320999	2026-10-15 11:16:31.525195	qa-wo-1792062985410-after	qa-wo-1792062985410-after-shift
qa-shift-number-1792067132035-submission-1	work_order_daily_completion			\N	{"_meta": {"normalizedAt": "2026-10-15T12:25:40.848Z", "contractVersion": "1.0.0"}, "notes": "TEST ONLY - NOT FOR BILLING", "client": "QA TEST", "job_name": "SAME ASSIGNMENT / SHIFT 1", "work_date": "2026-10-15", "work_shift": "Day Shift", "worker_signature": {"type": "signature-path", "width": 600, "height": 220, "strokes": [[{"x": 30, "y": 130}, {"x": 100, "y": 70}, {"x": 160, "y": 130}]]}, "worker_timesheets": [{"endTime": "16:00", "workerId": "qa-shift-number-1792067132035-worker", "signature": {"type": "signature-path", "width": 600, "height": 220, "strokes": [[{"x": 30, "y": 130}, {"x": 100, "y": 70}, {"x": 160, "y": 130}]]}, "startTime": "08:00", "lunchTaken": true, "workerName": "QA Shift Numbering", "breakMinutes": 30, "regularHours": 8}], "description_of_work": "Reproduce repeated WO number from the mobile submission endpoint.", "dr_traffic_job_number": "QA", "completion_confirmation": true}	submitted	/files/generated-form-pdfs/qa-shift-number-1792067132035-submission-1.pdf	2026-10-15 12:25:40.851422	2026-10-15 12:25:41.131934	qa-shift-number-1792067132035	qa-shift-number-1792067132035-shift-1
qa-shift-number-1792067132035-submission-2	work_order_daily_completion			\N	{"_meta": {"normalizedAt": "2026-10-15T12:25:41.190Z", "contractVersion": "1.0.0"}, "notes": "TEST ONLY - NOT FOR BILLING", "client": "QA TEST", "job_name": "SAME ASSIGNMENT / SHIFT 2", "work_date": "2026-10-16", "work_shift": "Day Shift", "worker_signature": {"type": "signature-path", "width": 600, "height": 220, "strokes": [[{"x": 30, "y": 130}, {"x": 100, "y": 70}, {"x": 160, "y": 130}]]}, "worker_timesheets": [{"endTime": "16:00", "workerId": "qa-shift-number-1792067132035-worker", "signature": {"type": "signature-path", "width": 600, "height": 220, "strokes": [[{"x": 30, "y": 130}, {"x": 100, "y": 70}, {"x": 160, "y": 130}]]}, "startTime": "08:00", "lunchTaken": true, "workerName": "QA Shift Numbering", "breakMinutes": 30, "regularHours": 8}], "description_of_work": "Reproduce repeated WO number from the mobile submission endpoint.", "dr_traffic_job_number": "QA", "completion_confirmation": true}	submitted	/files/generated-form-pdfs/qa-shift-number-1792067132035-submission-2.pdf	2026-10-15 12:25:41.192837	2026-10-15 12:25:41.407913	qa-shift-number-1792067132035	qa-shift-number-1792067132035-shift-2
\.


--
-- Data for Name: form_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.form_templates (id, name, description, category, is_required, fields, assigned_projects, assigned_roles, created_at, updated_at) FROM stdin;
incident_report_field_report	Incident Report	Field incident report for injuries, damage, unsafe events, and near misses.	Incident Report	t	[{"id": "report_date", "ui": {"layout": "half", "section": "Incident Details", "helperText": "Use this form only for job-related incidents, unsafe events, injuries, damage, or near misses. Keep the report factual and specific.", "defaultValue": "2026-04-01", "sectionDescription": "Capture the incident clearly and quickly"}, "key": "reportDate", "type": "date", "label": "Report Date", "version": "1.0.0", "required": true, "dataBinding": {"path": "shift.date", "optional": true}}, {"id": "report_time", "ui": {"layout": "half", "section": "Incident Details", "defaultValue": "08:45"}, "key": "reportTime", "type": "time", "label": "Report Time", "version": "1.0.0", "required": true, "dataBinding": {"path": "shift.startTime", "optional": true}}, {"id": "incident_type", "ui": {"layout": "full", "section": "Incident Details", "tagTone": "amber", "defaultValue": "Injury"}, "key": "incidentType", "type": "dropdown", "label": "Incident Type", "options": ["Injury", "Near Miss", "Property Damage", "Traffic Event", "Equipment Issue", "Safety Violation"], "version": "1.0.0", "required": true}, {"id": "severity", "ui": {"layout": "full", "section": "Incident Details", "defaultValue": "Medium"}, "key": "severity", "type": "dropdown", "label": "Severity", "options": ["Low", "Medium", "High", "Critical"], "version": "1.0.0", "required": true}, {"id": "incident_date", "ui": {"layout": "half", "section": "Incident Details", "defaultValue": "2026-04-01"}, "key": "incidentDate", "type": "date", "label": "Incident Date", "version": "1.0.0", "required": true, "dataBinding": {"path": "shift.date", "optional": true}}, {"id": "incident_time", "ui": {"layout": "half", "section": "Incident Details", "defaultValue": "08:20"}, "key": "incidentTime", "type": "time", "label": "Incident Time", "version": "1.0.0", "required": true}, {"id": "incident_location", "ui": {"layout": "full", "section": "Incident Details", "defaultValue": "West side staging area near Redwood Blvd intersection"}, "key": "incidentLocation", "type": "text", "label": "Location", "version": "1.0.0", "required": true, "dataBinding": {"path": "shift.address", "optional": true}}, {"id": "person_reporting", "ui": {"layout": "full", "section": "Incident Details", "defaultValue": "Derek Doan"}, "key": "personReporting", "type": "text", "label": "Person Reporting", "version": "1.0.0", "required": true, "placeholder": "Enter the reporter name"}, {"id": "people_involved", "ui": {"layout": "full", "section": "Incident Details", "defaultValue": "Freddy Moran - Flagger\\nPena Zamora - Crew\\nDerek Doan - Foreman"}, "key": "peopleInvolved", "type": "textarea", "label": "People Involved", "rules": {"maxLength": 2000}, "version": "1.0.0", "required": false, "dataBinding": {"path": "shift.workerNames", "optional": true}, "placeholder": "List names and roles of people involved..."}, {"id": "what_happened", "ui": {"layout": "full", "section": "Incident Details", "tagTone": "amber", "quickTags": ["Slip / Trip / Fall", "Minor injury", "No vehicle involved", "Traffic control area", "Equipment handling", "Site hazard"], "helperText": "Use quick tags to speed up repeated descriptions.", "defaultValue": "Worker slipped while moving cones near the shoulder area. No vehicle collision occurred. Minor injury reported to lower arm."}, "key": "whatHappened", "type": "textarea", "label": "What Happened?", "rules": {"maxLength": 4000, "minLength": 3}, "version": "1.0.0", "required": true, "placeholder": "Describe the incident clearly and factually..."}, {"id": "immediate_actions_taken", "ui": {"layout": "full", "section": "Immediate Response", "defaultValue": "Foreman stopped cone movement in the area, checked the worker, moved crew away from hazard, and documented the scene.", "sectionDescription": "Document what was done right away"}, "key": "immediateActionsTaken", "type": "textarea", "label": "Immediate Actions Taken", "rules": {"maxLength": 4000, "minLength": 3}, "version": "1.0.0", "required": true, "placeholder": "Describe immediate response..."}, {"id": "medical_attention_needed", "ui": {"layout": "full", "section": "Immediate Response", "defaultValue": "No"}, "key": "medicalAttentionNeeded", "type": "dropdown", "label": "Medical Attention Needed?", "options": ["No", "Yes"], "version": "1.0.0", "required": true}, {"id": "work_stopped", "ui": {"layout": "full", "section": "Immediate Response", "defaultValue": "Yes"}, "key": "workStopped", "type": "dropdown", "label": "Work Stopped?", "options": ["No", "Yes"], "version": "1.0.0", "required": true}, {"id": "supervisor_notified", "ui": {"layout": "full", "section": "Immediate Response", "defaultValue": "Yes"}, "key": "supervisorNotified", "type": "dropdown", "label": "Was Supervisor Notified?", "options": ["Yes", "No"], "version": "1.0.0", "required": true}, {"id": "witnesses", "ui": {"layout": "full", "section": "Witnesses & Evidence", "defaultValue": "Maria Santos - Operator\\nAngel Ramirez - Flagger", "sectionDescription": "Add supporting information"}, "key": "witnesses", "type": "textarea", "label": "Witnesses", "rules": {"maxLength": 2000}, "version": "1.0.0", "required": false, "placeholder": "List witnesses if any..."}, {"id": "photos_evidence", "ui": {"layout": "full", "section": "Witnesses & Evidence", "helperText": "Tap to upload photos or supporting evidence. JPG, PNG, PDF supported."}, "key": "photosEvidence", "type": "attachment", "label": "Photos / Evidence", "rules": {"maxFiles": 10, "maxFileSizeMb": 25, "acceptedMimeTypes": ["image/jpeg", "image/png", "application/pdf"]}, "version": "1.0.0", "required": false}, {"id": "additional_notes", "ui": {"layout": "full", "section": "Witnesses & Evidence"}, "key": "additionalNotes", "type": "textarea", "label": "Additional Notes", "rules": {"maxLength": 4000}, "version": "1.0.0", "required": false, "placeholder": "Add anything else relevant..."}, {"id": "reporter_signature", "ui": {"layout": "full", "section": "Final Review", "sectionDescription": "Confirm and sign the report"}, "key": "reporterSignature", "type": "signature", "label": "Reporter Signature", "version": "1.0.0", "required": true}, {"id": "incident_report_confirmation", "ui": {"layout": "full", "section": "Final Review", "defaultValue": true}, "key": "incidentReportConfirmation", "type": "checkbox", "label": "I confirm this incident report is accurate to the best of my knowledge and reflects the facts known at the time of submission.", "version": "1.0.0", "required": true}]	{}	{worker,foreman,admin,manager}	2026-06-22 22:23:20.327899	2026-07-17 17:34:50.027439
work_order_daily_completion	Work Order Form	Daily work order completion form for field crews.	Work Order	t	[{"id": "dr_traffic_job_number", "ui": {"layout": "half", "section": "Work Order Details", "defaultValue": "1916", "sectionDescription": "Fill out the job form for today"}, "key": "drTrafficJobNumber", "type": "text", "label": "DR Traffic Job #", "version": "1.0.0", "required": true, "dataBinding": {"path": "project.number", "optional": true}}, {"id": "work_date", "ui": {"layout": "half", "section": "Work Order Details", "defaultValue": "2026-03-30"}, "key": "workDate", "type": "date", "label": "Date", "version": "1.0.0", "required": true, "dataBinding": {"path": "shift.date", "optional": true}}, {"id": "job_name", "ui": {"layout": "half", "section": "Work Order Details", "defaultValue": "Redwood Blvd"}, "key": "jobName", "type": "text", "label": "Job Name", "version": "1.0.0", "required": true, "dataBinding": {"path": "project.name", "optional": true}}, {"id": "cost_code", "ui": {"layout": "half", "section": "Work Order Details"}, "key": "costCode", "type": "text", "label": "Cost Code", "version": "1.0.0", "required": false, "placeholder": "Enter cost code"}, {"id": "description_of_work", "ui": {"layout": "full", "section": "Work Order Details", "tagTone": "blue", "quickTags": ["Shift lane", "Lane closure setup", "Traffic control support", "Set cones and signage", "Pickup cones and material", "Concrete watch", "Flagging operations"], "helperText": "Tap tags to quickly add repeated work descriptions.", "defaultValue": "Shift lane."}, "key": "descriptionOfWork", "type": "textarea", "label": "Description of Work", "rules": {"maxLength": 2000, "minLength": 3}, "version": "1.0.0", "required": true, "placeholder": "Describe the work completed today..."}, {"id": "client", "ui": {"layout": "half", "section": "Work Order Details", "defaultValue": "Rosendin"}, "key": "client", "type": "text", "label": "Client", "version": "1.0.0", "required": true, "dataBinding": {"path": "client.name", "optional": true}}, {"id": "contact", "ui": {"layout": "half", "section": "Work Order Details"}, "key": "contact", "type": "text", "label": "Contact", "version": "1.0.0", "required": false, "dataBinding": {"path": "client.contactName", "optional": true}, "placeholder": "Enter contact name"}, {"id": "work_shift", "ui": {"layout": "full", "section": "Work Order Details", "helperText": "Automatically loaded from the selected shift."}, "key": "workShift", "type": "text", "label": "Work Shift", "version": "1.0.0", "required": true, "dataBinding": {"path": "shift.shiftTypeName", "editable": false, "optional": false}}, {"id": "worker_timesheets", "ui": {"layout": "full", "section": "Labor & Equipment", "helperText": "Workers are loaded from the selected shift. Complete each worker timesheet before submitting.", "sectionDescription": "Review hours and collect signatures for each worker on this shift"}, "key": "workerTimesheets", "type": "timesheet", "label": "Worker Timesheets", "version": "1.0.0", "required": true, "dataBinding": {"path": "shift.timesheetWorkers", "optional": false}}, {"id": "equipment_id", "ui": {"layout": "half", "section": "Labor & Equipment", "defaultValue": "01-07"}, "key": "equipmentId", "type": "text", "label": "Equip ID", "version": "1.0.0", "required": false, "dataBinding": {"path": "shift.equipmentSummary", "optional": true}}, {"id": "equipment_hours", "ui": {"layout": "half", "section": "Labor & Equipment", "defaultValue": 8}, "key": "equipmentHours", "type": "number", "label": "Equipment Hours", "rules": {"max": 24, "min": 0, "step": 0.25, "integer": false}, "version": "1.0.0", "required": false}, {"id": "extra_work_details", "ui": {"layout": "full", "section": "Extra Work / Overtime Details", "tagTone": "amber", "quickTags": ["+1 no lunch no break", "+1 hour demob barricades", "+1 hour demob arrowboard", "+1 hour pick up cones or material"], "defaultValue": "+1 no lunch no break", "sectionDescription": "Use quick entries for repeated extra work items"}, "key": "extraWorkDetails", "type": "textarea", "label": "Extra Work Details", "rules": {"maxLength": 2000}, "version": "1.0.0", "required": false, "placeholder": "Add overtime details, no lunch note, or extra work performed..."}, {"id": "notes", "ui": {"layout": "full", "section": "Notes & Signature", "sectionDescription": "Final notes and confirmation"}, "key": "notes", "type": "textarea", "label": "Notes", "rules": {"maxLength": 2000}, "version": "1.0.0", "required": false, "placeholder": "Add any final notes for this work order..."}, {"id": "worker_signature", "ui": {"layout": "full", "section": "Notes & Signature"}, "key": "workerSignature", "type": "signature", "label": "Employee / Foreman Signature", "rules": {"hiddenForMobileRoles": ["viewer"]}, "version": "1.0.0", "required": true}, {"id": "customer_approval_signature", "ui": {"layout": "full", "section": "Notes & Signature"}, "key": "customerApprovalSignature", "type": "signature", "label": "Customer Contract / Approval", "rules": {"hiddenForMobileRoles": ["viewer"]}, "version": "1.0.0", "required": false}, {"id": "completion_confirmation", "ui": {"layout": "full", "section": "Notes & Signature", "defaultValue": true}, "key": "completionConfirmation", "type": "checkbox", "label": "I confirm this work order information is complete and accurate.", "version": "1.0.0", "required": true}]	{}	{worker,foreman,admin,manager}	2026-06-22 22:23:20.264791	2026-07-17 17:34:49.976487
\.


--
-- Data for Name: incidents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.incidents (id, project_id, reported_by, date, severity, status, title, description, location, photos, actions, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: materials; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.materials (id, name, type, identifier, brand, status, last_maintenance, next_maintenance, notes, created_at, updated_at, price, deleted_at) FROM stdin;
mat_demo_sign	Sign Aluminum 48x48	Signage	SIGN-ALU-48		available	\N	\N		2026-06-22 22:23:21.228296	2026-06-22 22:23:21.228296	0.00	\N
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.migrations (id, "timestamp", name) FROM stdin;
1	260407000100	CreateIamTables20260407000100
2	260407000200	CreateOperationsTables20260407000200
3	260428000100	CreateShiftAssignmentConfirmations20260428000100
4	260428000200	MigrateUserProfilesToUsers20260428000200
5	260428000300	AddTwilioDeliveryTracking20260428000300
6	260429000100	AddWorkAndShiftStatuses20260429000100
7	260429000200	AddWorkOrderDispatchAndFiles20260429000200
8	260429000300	CreateCertificationsAndWorkerRelations20260429000300
9	260429000400	AddWorkerAddressAndLicenseFields20260429000400
10	260429000500	AddCertificationDocumentUrl20260429000500
11	260429000600	AddClientWebsite20260429000600
12	260429000700	AddWorkerFileUploads20260429000700
13	260429000800	AddProjectTypesAndProjectFields20260429000800
14	260430000100	AddWorkOrderRequesterFields20260430000100
15	260504000100	AddWorkerExpirationDate20260504000100
16	260504000200	CreateSkillsAndWorkerRelations20260504000200
17	260505000100	AddMaterialsModule20260505000100
18	260505000300	AddWorkOrderAssignmentAddress20260505000300
19	260506001000	AddWorkOrderAssignmentAddressParts20260506001000
20	260506002000	AddGeoAndPostalExpandWorkersClientsProjects20260506002000
21	260507003000	AddWorkerDriverLicenseExpiration20260507003000
22	260510001000	AddCompanySettingsAssignmentAutoStatus20260510001000
23	260512001000	FormTemplatesAssignmentsAndSubmissionContext20260512001000
24	260512002000	AddWorkOrderFormTemplateIds20260512002000
25	260512003000	DropFormTemplateAssignedWorkOrders20260512003000
26	260512004000	AddFormSubmissionPdfUrl20260512004000
27	260519000100	CreateWorkerRolesAndRelations20260519000100
28	260520001000	AddShiftScopedTimesheets20260520001000
29	260523000100	AddWorkerFcmTokens20260523000100
30	260526000100	ExtendNotificationsForFcm20260526000100
31	260527000100	AddFormTemplateIsRequired20260527000100
32	260604000100	CreateShiftChatMessages20260604000100
33	260605000100	AddShiftChatReplies20260605000100
34	260606000100	HideCustomerSignatureForMobileViewer20260606000100
35	260606000200	HideTimesheetCustomerApprovalForMobileViewer20260606000200
36	260608000100	HideFinalTimesheetSignaturesForMobileViewer20260608000100
37	260608001000	CreateCommercialWorkOrders20260608001000
38	260609001000	CreateCommercialCatalogAndInvoices20260609001000
39	260610001000	AddItemPriceToCommercialCatalog20260610001000
40	260610002000	AddMinimumRestHoursToCompanySettings20260610002000
41	260611001000	AddLogoIconToCompanySettings20260611001000
42	260612001000	AddWorkOrderRecycleBin20260612001000
43	260616001000	FixCompletedWorkOrderStatusColor20260616001000
44	260622001000	CreateWorkOrderShiftsRelational20260622001000
45	260623001000	DropShiftsColumn20260623001000
54	260702001000	AddPriceToMaterials20260702001000
55	260702002000	AddWorkOrderNumberingConfig20260702002000
56	260708001000	SetNoLunchCreditToOvertime20260708001000
57	260710001000	AddShiftOverviewFields20260710001000
58	260710002000	RelateShiftOverviewUsersAndAddress20260710002000
59	260712001000	AddShiftStatusCatalog20260712001000
60	260712002000	AddShiftCancelledFlag20260712002000
61	260712003000	MakeShiftStatusOptional20260712003000
62	260712004000	UseShiftAddressInFormTemplates20260712004000
63	260714001000	AddShiftCrossStreetLocationDetail20260714001000
64	260716001000	AddResourceTypesToShiftRoles20260716001000
65	260717001000	AddPlannedResourcesToShifts20260717001000
66	260720001000	AddShiftRequesterContact20260720001000
67	260721001000	AddEquipmentMaterialsSoftDelete20260721001000
68	260723001000	AddShiftName20260723001000
69	260724001000	BindWorkShiftToShiftType20260724001000
70	260727001000	AddShiftWorkOrderAuthorizedWorkers20260727001000
71	260727002000	LinkWorkersToUsers20260727002000
72	260729001000	AddWorkOrderTypesToShifts20260729001000
73	260730001000	AddWorkOrderTypeOptionsToCompanySettings20260730001000
74	260801001000	AddWorkOrderPdfBuilderToCompanySettings20260801001000
75	260803001000	AddTimesheetVariants20260803001000
76	260804001000	RemoveRoleResources20260804001000
77	260805001000	AddPmApprovalToShifts20260805001000
78	260805002000	SetPmApprovedStatusColor20260805002000
79	260806001000	IncludeVariantInTimesheetUniqueIndex20260806001000
80	260811001000	AddShiftConfirmationResetReason20260811001000
81	260811002000	AddShiftDisplayOrder20260811002000
82	260817001000	AddPasswordResetTokens20260817001000
83	260909001000	MoveFormTemplatesFromAssignmentsToShifts20260909001000
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, type, title, message, "timestamp", read, link, created_at, updated_at, channel, worker_id, work_order_id, shift_id, role_id, delivery_status, provider_message_id) FROM stdin;
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.permissions (id, key, description, created_at, updated_at) FROM stdin;
fededd22-fa8b-491e-8b0c-9a05dfd29741	access.manage	Administrar roles y permisos	2026-06-22 22:10:07.208595	2026-06-22 22:10:07.208595
152e883c-d2a2-43e6-878a-5f897ef57d51	access.read	Consultar roles y permisos	2026-06-22 22:10:07.296148	2026-06-22 22:10:07.296148
1654b1fd-5a66-4661-9b76-184e2f267e53	mobile.assignments.read	Mobile: ver assignments asignados	2026-06-22 22:10:07.317863	2026-06-22 22:10:07.317863
2fd1aeb9-9c6d-45da-ba7c-5bb3668fc540	mobile.shifts.read	Mobile: ver shifts asignados	2026-06-22 22:10:07.335388	2026-06-22 22:10:07.335388
b093e2be-33d7-4c18-9d89-427e6ec7de1e	mobile.shifts.confirm	Mobile: confirmar o declinar shifts	2026-06-22 22:10:07.351009	2026-06-22 22:10:07.351009
2d6a1a29-dbe8-48fe-9085-c67513b074a8	mobile.timesheets.submit	Mobile: enviar timesheets	2026-06-22 22:10:07.363483	2026-06-22 22:10:07.363483
6af91a7c-6e00-430b-be8d-cea1de9c360f	mobile.incidents.submit	Mobile: enviar incident reports	2026-06-22 22:10:07.391376	2026-06-22 22:10:07.391376
068a7007-8191-41be-becf-49e20e697275	mobile.work-orders.submit	Mobile: enviar work orders	2026-06-22 22:10:07.416906	2026-06-22 22:10:07.416906
7ca17d30-c21a-45b2-937a-3f36a34126e2	users.read	Consultar usuarios	2026-06-22 22:10:07.440711	2026-06-22 22:10:07.440711
c29b517f-5617-4355-907f-b37924da0b86	users.write	Crear, editar y eliminar usuarios	2026-06-22 22:10:07.456468	2026-06-22 22:10:07.456468
c3bce1ac-cfe0-40fa-a4db-df36b11bb413	activity-feed.read	Leer activity-feed	2026-06-22 22:10:07.47233	2026-06-22 22:10:07.47233
e89610ff-f3de-46a8-b063-c9730fb0a997	activity-feed.write	Editar activity-feed	2026-06-22 22:10:07.499318	2026-06-22 22:10:07.499318
b13deec3-04b8-4d35-a6e4-6e7307613dda	availability-requests.read	Leer availability-requests	2026-06-22 22:10:07.512091	2026-06-22 22:10:07.512091
eb1e629a-5827-456c-a6bb-8fe90b773115	availability-requests.write	Editar availability-requests	2026-06-22 22:10:07.525921	2026-06-22 22:10:07.525921
9a6698f2-04a4-4233-a646-19073cf04003	certifications.read	Leer certifications	2026-06-22 22:10:07.538368	2026-06-22 22:10:07.538368
b4b76e46-a21f-4316-8318-61e231597e54	certifications.write	Editar certifications	2026-06-22 22:10:07.550623	2026-06-22 22:10:07.550623
e88b0b67-2b34-4601-9492-1e1b8c54868f	clients.read	Leer clients	2026-06-22 22:10:07.562933	2026-06-22 22:10:07.562933
d6da40b6-4ded-49f0-95a3-bc20917734c7	clients.write	Editar clients	2026-06-22 22:10:07.577892	2026-06-22 22:10:07.577892
1fc869c5-bc99-472f-b114-50d3e2eadbfe	commercial-catalog-items.read	Leer commercial-catalog-items	2026-06-22 22:10:07.594499	2026-06-22 22:10:07.594499
c7078116-a2be-4ba9-8d59-020188311d88	commercial-catalog-items.write	Editar commercial-catalog-items	2026-06-22 22:10:07.609934	2026-06-22 22:10:07.609934
d6b89c0b-fe66-476a-9d7d-f610427f8793	company-settings.read	Leer company-settings	2026-06-22 22:10:07.626089	2026-06-22 22:10:07.626089
40a9ea75-4d60-4b1c-b0eb-47dab3943022	company-settings.write	Editar company-settings	2026-06-22 22:10:07.64549	2026-06-22 22:10:07.64549
476486aa-a47d-4aa9-becb-a8de54b6857f	equipment.read	Leer equipment	2026-06-22 22:10:07.661252	2026-06-22 22:10:07.661252
e39229a0-6b76-42cf-837c-851224075f64	equipment.write	Editar equipment	2026-06-22 22:10:07.677276	2026-06-22 22:10:07.677276
d744e6e8-f482-4831-9c9c-db78097a0f80	form-submissions.read	Leer form-submissions	2026-06-22 22:10:07.692813	2026-06-22 22:10:07.692813
6d12a719-8ed1-4382-af76-0804140379a1	form-submissions.write	Editar form-submissions	2026-06-22 22:10:07.708924	2026-06-22 22:10:07.708924
306ee226-dbd9-4900-be39-f84fc99c6acc	form-templates.read	Leer form-templates	2026-06-22 22:10:07.738816	2026-06-22 22:10:07.738816
f2175161-abeb-4905-a7c6-41d9a0b23e8e	form-templates.write	Editar form-templates	2026-06-22 22:10:07.756816	2026-06-22 22:10:07.756816
65a86a30-c3b1-4bd0-b130-57da3fe85fa2	incidents.read	Leer incidents	2026-06-22 22:10:07.770897	2026-06-22 22:10:07.770897
71d7d55e-97a5-453b-b8d7-0b9d00e2cc7a	incidents.write	Editar incidents	2026-06-22 22:10:07.790687	2026-06-22 22:10:07.790687
19ce7b9c-f571-4e2a-9fbe-e051daa58a1b	materials.read	Leer materials	2026-06-22 22:10:07.804467	2026-06-22 22:10:07.804467
8d81215e-1ef3-47b7-a176-1eafcfcfd84d	materials.write	Editar materials	2026-06-22 22:10:07.815337	2026-06-22 22:10:07.815337
9750edc7-85a5-4105-ac58-ff363ef9e79e	notifications.read	Leer notifications	2026-06-22 22:10:07.82604	2026-06-22 22:10:07.82604
b21f9d89-4244-4ea9-aefe-37a6d662bdee	notifications.write	Editar notifications	2026-06-22 22:10:07.838491	2026-06-22 22:10:07.838491
8485c721-884d-4124-a2ac-ac1d91e70b43	projects.read	Leer projects	2026-06-22 22:10:07.85073	2026-06-22 22:10:07.85073
9a681921-33cf-4fce-ac98-f9e59bbadd57	projects.write	Editar projects	2026-06-22 22:10:07.861177	2026-06-22 22:10:07.861177
2b4693e9-6a1b-4412-a8d0-6fb7d2bb4c08	project-types.read	Leer project-types	2026-06-22 22:10:07.871645	2026-06-22 22:10:07.871645
07484fe3-0fc0-4a82-b3f2-0437022bc905	project-types.write	Editar project-types	2026-06-22 22:10:07.887263	2026-06-22 22:10:07.887263
f596a275-22b0-491e-964d-71bb541ef049	shifts.read	Leer shifts	2026-06-22 22:10:07.903959	2026-06-22 22:10:07.903959
dd054b69-e42d-4714-a258-ebc80410e07d	shifts.write	Editar shifts	2026-06-22 22:10:07.922619	2026-06-22 22:10:07.922619
fd99c965-4610-49c7-b51b-f6c042af5dd3	skills.read	Leer skills	2026-06-22 22:10:07.93905	2026-06-22 22:10:07.93905
9fac9676-04be-460d-9e96-c142f2bce185	skills.write	Editar skills	2026-06-22 22:10:07.953185	2026-06-22 22:10:07.953185
e681cb5c-50e9-43b4-98d3-4dd3732a07ac	status-catalog.read	Leer status-catalog	2026-06-22 22:10:07.970106	2026-06-22 22:10:07.970106
8dd73e70-9104-4856-a811-85225880f015	status-catalog.write	Editar status-catalog	2026-06-22 22:10:07.987035	2026-06-22 22:10:07.987035
c5ebb272-6907-4bfa-a250-5182520d315a	timesheets.read	Leer timesheets	2026-06-22 22:10:07.997437	2026-06-22 22:10:07.997437
96b4f471-710a-4dc7-82f2-55f1dc336720	timesheets.write	Editar timesheets	2026-06-22 22:10:08.00995	2026-06-22 22:10:08.00995
18c46e68-d11a-41c0-a52a-0b8ec4a6ba43	work-order-types.read	Leer tipos de asignación	2026-06-22 22:10:08.022915	2026-06-22 22:10:08.022915
183ee6f0-e26f-4374-9cd0-9294ef1c0d75	work-order-types.write	Editar tipos de asignación	2026-06-22 22:10:08.032816	2026-06-22 22:10:08.032816
232e61fd-f2b1-4422-aa73-1870a3ac99b5	work-orders.read	Leer asignaciones	2026-06-22 22:10:08.048368	2026-06-22 22:10:08.048368
7df2c074-3d5e-40bf-9ce3-31a9537882c2	work-orders.write	Editar asignaciones	2026-06-22 22:10:08.059503	2026-06-22 22:10:08.059503
843f7bc8-6d1b-4ab7-be0c-877702b3fc2b	workers.read	Leer workers	2026-06-22 22:10:08.19711	2026-06-22 22:10:08.19711
9c47a66d-e624-4288-8581-8c38c1fda2c9	workers.write	Editar workers	2026-06-22 22:10:08.207339	2026-06-22 22:10:08.207339
0c7764bd-b9b3-4f26-b2fa-8782a1a430a4	worker-roles.read	Leer worker-roles	2026-06-22 22:10:08.221139	2026-06-22 22:10:08.221139
f903bc56-817b-4935-a354-c61989cf5e8d	worker-roles.write	Editar worker-roles	2026-06-22 22:10:08.23561	2026-06-22 22:10:08.23561
\.


--
-- Data for Name: project_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.project_types (id, name, description, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.projects (id, number, name, client_id, project_type_id, project_manager, project_manager_email, location, city, status, start_date, end_date, work_order_number, purchase_order, description, notes, created_at, updated_at, state, zip_code, latitude, longitude, country) FROM stdin;
proj_demo_pge	PROJ-2026-001	PG&E Infrastructure Services	cli_demo_pge				123 Main St	San Francisco	active	2026-07-17	2026-08-17	\N	ASN-2026-856	Lane closure and traffic control for PG&E utility work		2026-06-22 22:23:21.088294	2026-07-17 17:39:57.310059	CA	94124	37.737	-122.387	USA
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.role_permissions (role_id, permission_id) FROM stdin;
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	c3bce1ac-cfe0-40fa-a4db-df36b11bb413
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	b13deec3-04b8-4d35-a6e4-6e7307613dda
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	9a6698f2-04a4-4233-a646-19073cf04003
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	e88b0b67-2b34-4601-9492-1e1b8c54868f
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	1fc869c5-bc99-472f-b114-50d3e2eadbfe
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	d6b89c0b-fe66-476a-9d7d-f610427f8793
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	476486aa-a47d-4aa9-becb-a8de54b6857f
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	d744e6e8-f482-4831-9c9c-db78097a0f80
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	306ee226-dbd9-4900-be39-f84fc99c6acc
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	65a86a30-c3b1-4bd0-b130-57da3fe85fa2
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	19ce7b9c-f571-4e2a-9fbe-e051daa58a1b
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	9750edc7-85a5-4105-ac58-ff363ef9e79e
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	8485c721-884d-4124-a2ac-ac1d91e70b43
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	2b4693e9-6a1b-4412-a8d0-6fb7d2bb4c08
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	f596a275-22b0-491e-964d-71bb541ef049
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	fd99c965-4610-49c7-b51b-f6c042af5dd3
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	e681cb5c-50e9-43b4-98d3-4dd3732a07ac
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	c5ebb272-6907-4bfa-a250-5182520d315a
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	18c46e68-d11a-41c0-a52a-0b8ec4a6ba43
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	232e61fd-f2b1-4422-aa73-1870a3ac99b5
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	843f7bc8-6d1b-4ab7-be0c-877702b3fc2b
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	0c7764bd-b9b3-4f26-b2fa-8782a1a430a4
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	1654b1fd-5a66-4661-9b76-184e2f267e53
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	2fd1aeb9-9c6d-45da-ba7c-5bb3668fc540
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	b093e2be-33d7-4c18-9d89-427e6ec7de1e
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	2d6a1a29-dbe8-48fe-9085-c67513b074a8
fa029ecf-dd24-4aa8-802f-827f0c75df7f	c3bce1ac-cfe0-40fa-a4db-df36b11bb413
fa029ecf-dd24-4aa8-802f-827f0c75df7f	b13deec3-04b8-4d35-a6e4-6e7307613dda
fa029ecf-dd24-4aa8-802f-827f0c75df7f	9a6698f2-04a4-4233-a646-19073cf04003
fa029ecf-dd24-4aa8-802f-827f0c75df7f	e88b0b67-2b34-4601-9492-1e1b8c54868f
fa029ecf-dd24-4aa8-802f-827f0c75df7f	1fc869c5-bc99-472f-b114-50d3e2eadbfe
fa029ecf-dd24-4aa8-802f-827f0c75df7f	d6b89c0b-fe66-476a-9d7d-f610427f8793
fa029ecf-dd24-4aa8-802f-827f0c75df7f	476486aa-a47d-4aa9-becb-a8de54b6857f
fa029ecf-dd24-4aa8-802f-827f0c75df7f	d744e6e8-f482-4831-9c9c-db78097a0f80
fa029ecf-dd24-4aa8-802f-827f0c75df7f	306ee226-dbd9-4900-be39-f84fc99c6acc
fa029ecf-dd24-4aa8-802f-827f0c75df7f	65a86a30-c3b1-4bd0-b130-57da3fe85fa2
fa029ecf-dd24-4aa8-802f-827f0c75df7f	19ce7b9c-f571-4e2a-9fbe-e051daa58a1b
fa029ecf-dd24-4aa8-802f-827f0c75df7f	9750edc7-85a5-4105-ac58-ff363ef9e79e
fa029ecf-dd24-4aa8-802f-827f0c75df7f	8485c721-884d-4124-a2ac-ac1d91e70b43
fa029ecf-dd24-4aa8-802f-827f0c75df7f	2b4693e9-6a1b-4412-a8d0-6fb7d2bb4c08
fa029ecf-dd24-4aa8-802f-827f0c75df7f	f596a275-22b0-491e-964d-71bb541ef049
fa029ecf-dd24-4aa8-802f-827f0c75df7f	fd99c965-4610-49c7-b51b-f6c042af5dd3
fa029ecf-dd24-4aa8-802f-827f0c75df7f	e681cb5c-50e9-43b4-98d3-4dd3732a07ac
fa029ecf-dd24-4aa8-802f-827f0c75df7f	c5ebb272-6907-4bfa-a250-5182520d315a
fa029ecf-dd24-4aa8-802f-827f0c75df7f	18c46e68-d11a-41c0-a52a-0b8ec4a6ba43
fa029ecf-dd24-4aa8-802f-827f0c75df7f	232e61fd-f2b1-4422-aa73-1870a3ac99b5
fa029ecf-dd24-4aa8-802f-827f0c75df7f	843f7bc8-6d1b-4ab7-be0c-877702b3fc2b
fa029ecf-dd24-4aa8-802f-827f0c75df7f	0c7764bd-b9b3-4f26-b2fa-8782a1a430a4
fa029ecf-dd24-4aa8-802f-827f0c75df7f	e89610ff-f3de-46a8-b063-c9730fb0a997
fa029ecf-dd24-4aa8-802f-827f0c75df7f	eb1e629a-5827-456c-a6bb-8fe90b773115
fa029ecf-dd24-4aa8-802f-827f0c75df7f	6d12a719-8ed1-4382-af76-0804140379a1
fa029ecf-dd24-4aa8-802f-827f0c75df7f	71d7d55e-97a5-453b-b8d7-0b9d00e2cc7a
fa029ecf-dd24-4aa8-802f-827f0c75df7f	b21f9d89-4244-4ea9-aefe-37a6d662bdee
fa029ecf-dd24-4aa8-802f-827f0c75df7f	dd054b69-e42d-4714-a258-ebc80410e07d
fa029ecf-dd24-4aa8-802f-827f0c75df7f	96b4f471-710a-4dc7-82f2-55f1dc336720
fa029ecf-dd24-4aa8-802f-827f0c75df7f	7df2c074-3d5e-40bf-9ce3-31a9537882c2
fa029ecf-dd24-4aa8-802f-827f0c75df7f	1654b1fd-5a66-4661-9b76-184e2f267e53
fa029ecf-dd24-4aa8-802f-827f0c75df7f	2fd1aeb9-9c6d-45da-ba7c-5bb3668fc540
fa029ecf-dd24-4aa8-802f-827f0c75df7f	b093e2be-33d7-4c18-9d89-427e6ec7de1e
fa029ecf-dd24-4aa8-802f-827f0c75df7f	2d6a1a29-dbe8-48fe-9085-c67513b074a8
fa029ecf-dd24-4aa8-802f-827f0c75df7f	6af91a7c-6e00-430b-be8d-cea1de9c360f
fa029ecf-dd24-4aa8-802f-827f0c75df7f	068a7007-8191-41be-becf-49e20e697275
671b09ab-90de-4541-8440-cd30c4f06036	c3bce1ac-cfe0-40fa-a4db-df36b11bb413
671b09ab-90de-4541-8440-cd30c4f06036	b13deec3-04b8-4d35-a6e4-6e7307613dda
671b09ab-90de-4541-8440-cd30c4f06036	9a6698f2-04a4-4233-a646-19073cf04003
671b09ab-90de-4541-8440-cd30c4f06036	e88b0b67-2b34-4601-9492-1e1b8c54868f
671b09ab-90de-4541-8440-cd30c4f06036	1fc869c5-bc99-472f-b114-50d3e2eadbfe
671b09ab-90de-4541-8440-cd30c4f06036	d6b89c0b-fe66-476a-9d7d-f610427f8793
671b09ab-90de-4541-8440-cd30c4f06036	476486aa-a47d-4aa9-becb-a8de54b6857f
671b09ab-90de-4541-8440-cd30c4f06036	d744e6e8-f482-4831-9c9c-db78097a0f80
671b09ab-90de-4541-8440-cd30c4f06036	306ee226-dbd9-4900-be39-f84fc99c6acc
671b09ab-90de-4541-8440-cd30c4f06036	65a86a30-c3b1-4bd0-b130-57da3fe85fa2
671b09ab-90de-4541-8440-cd30c4f06036	19ce7b9c-f571-4e2a-9fbe-e051daa58a1b
671b09ab-90de-4541-8440-cd30c4f06036	9750edc7-85a5-4105-ac58-ff363ef9e79e
671b09ab-90de-4541-8440-cd30c4f06036	8485c721-884d-4124-a2ac-ac1d91e70b43
671b09ab-90de-4541-8440-cd30c4f06036	2b4693e9-6a1b-4412-a8d0-6fb7d2bb4c08
671b09ab-90de-4541-8440-cd30c4f06036	f596a275-22b0-491e-964d-71bb541ef049
671b09ab-90de-4541-8440-cd30c4f06036	fd99c965-4610-49c7-b51b-f6c042af5dd3
671b09ab-90de-4541-8440-cd30c4f06036	e681cb5c-50e9-43b4-98d3-4dd3732a07ac
671b09ab-90de-4541-8440-cd30c4f06036	c5ebb272-6907-4bfa-a250-5182520d315a
671b09ab-90de-4541-8440-cd30c4f06036	18c46e68-d11a-41c0-a52a-0b8ec4a6ba43
671b09ab-90de-4541-8440-cd30c4f06036	232e61fd-f2b1-4422-aa73-1870a3ac99b5
671b09ab-90de-4541-8440-cd30c4f06036	843f7bc8-6d1b-4ab7-be0c-877702b3fc2b
671b09ab-90de-4541-8440-cd30c4f06036	0c7764bd-b9b3-4f26-b2fa-8782a1a430a4
671b09ab-90de-4541-8440-cd30c4f06036	e89610ff-f3de-46a8-b063-c9730fb0a997
671b09ab-90de-4541-8440-cd30c4f06036	eb1e629a-5827-456c-a6bb-8fe90b773115
671b09ab-90de-4541-8440-cd30c4f06036	b4b76e46-a21f-4316-8318-61e231597e54
671b09ab-90de-4541-8440-cd30c4f06036	d6da40b6-4ded-49f0-95a3-bc20917734c7
671b09ab-90de-4541-8440-cd30c4f06036	c7078116-a2be-4ba9-8d59-020188311d88
671b09ab-90de-4541-8440-cd30c4f06036	40a9ea75-4d60-4b1c-b0eb-47dab3943022
671b09ab-90de-4541-8440-cd30c4f06036	e39229a0-6b76-42cf-837c-851224075f64
671b09ab-90de-4541-8440-cd30c4f06036	6d12a719-8ed1-4382-af76-0804140379a1
671b09ab-90de-4541-8440-cd30c4f06036	f2175161-abeb-4905-a7c6-41d9a0b23e8e
671b09ab-90de-4541-8440-cd30c4f06036	71d7d55e-97a5-453b-b8d7-0b9d00e2cc7a
671b09ab-90de-4541-8440-cd30c4f06036	8d81215e-1ef3-47b7-a176-1eafcfcfd84d
671b09ab-90de-4541-8440-cd30c4f06036	b21f9d89-4244-4ea9-aefe-37a6d662bdee
671b09ab-90de-4541-8440-cd30c4f06036	9a681921-33cf-4fce-ac98-f9e59bbadd57
671b09ab-90de-4541-8440-cd30c4f06036	07484fe3-0fc0-4a82-b3f2-0437022bc905
671b09ab-90de-4541-8440-cd30c4f06036	dd054b69-e42d-4714-a258-ebc80410e07d
671b09ab-90de-4541-8440-cd30c4f06036	9fac9676-04be-460d-9e96-c142f2bce185
671b09ab-90de-4541-8440-cd30c4f06036	8dd73e70-9104-4856-a811-85225880f015
671b09ab-90de-4541-8440-cd30c4f06036	96b4f471-710a-4dc7-82f2-55f1dc336720
671b09ab-90de-4541-8440-cd30c4f06036	183ee6f0-e26f-4374-9cd0-9294ef1c0d75
671b09ab-90de-4541-8440-cd30c4f06036	7df2c074-3d5e-40bf-9ce3-31a9537882c2
671b09ab-90de-4541-8440-cd30c4f06036	9c47a66d-e624-4288-8581-8c38c1fda2c9
671b09ab-90de-4541-8440-cd30c4f06036	f903bc56-817b-4935-a354-c61989cf5e8d
671b09ab-90de-4541-8440-cd30c4f06036	1654b1fd-5a66-4661-9b76-184e2f267e53
671b09ab-90de-4541-8440-cd30c4f06036	2fd1aeb9-9c6d-45da-ba7c-5bb3668fc540
671b09ab-90de-4541-8440-cd30c4f06036	b093e2be-33d7-4c18-9d89-427e6ec7de1e
671b09ab-90de-4541-8440-cd30c4f06036	2d6a1a29-dbe8-48fe-9085-c67513b074a8
671b09ab-90de-4541-8440-cd30c4f06036	6af91a7c-6e00-430b-be8d-cea1de9c360f
671b09ab-90de-4541-8440-cd30c4f06036	068a7007-8191-41be-becf-49e20e697275
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	c3bce1ac-cfe0-40fa-a4db-df36b11bb413
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	b13deec3-04b8-4d35-a6e4-6e7307613dda
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	9a6698f2-04a4-4233-a646-19073cf04003
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	e88b0b67-2b34-4601-9492-1e1b8c54868f
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	1fc869c5-bc99-472f-b114-50d3e2eadbfe
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	d6b89c0b-fe66-476a-9d7d-f610427f8793
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	476486aa-a47d-4aa9-becb-a8de54b6857f
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	d744e6e8-f482-4831-9c9c-db78097a0f80
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	306ee226-dbd9-4900-be39-f84fc99c6acc
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	65a86a30-c3b1-4bd0-b130-57da3fe85fa2
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	19ce7b9c-f571-4e2a-9fbe-e051daa58a1b
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	9750edc7-85a5-4105-ac58-ff363ef9e79e
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	8485c721-884d-4124-a2ac-ac1d91e70b43
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	2b4693e9-6a1b-4412-a8d0-6fb7d2bb4c08
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	f596a275-22b0-491e-964d-71bb541ef049
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	fd99c965-4610-49c7-b51b-f6c042af5dd3
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	e681cb5c-50e9-43b4-98d3-4dd3732a07ac
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	c5ebb272-6907-4bfa-a250-5182520d315a
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	18c46e68-d11a-41c0-a52a-0b8ec4a6ba43
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	232e61fd-f2b1-4422-aa73-1870a3ac99b5
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	843f7bc8-6d1b-4ab7-be0c-877702b3fc2b
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	0c7764bd-b9b3-4f26-b2fa-8782a1a430a4
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	e89610ff-f3de-46a8-b063-c9730fb0a997
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	eb1e629a-5827-456c-a6bb-8fe90b773115
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	b4b76e46-a21f-4316-8318-61e231597e54
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	d6da40b6-4ded-49f0-95a3-bc20917734c7
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	c7078116-a2be-4ba9-8d59-020188311d88
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	40a9ea75-4d60-4b1c-b0eb-47dab3943022
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	e39229a0-6b76-42cf-837c-851224075f64
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	6d12a719-8ed1-4382-af76-0804140379a1
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	f2175161-abeb-4905-a7c6-41d9a0b23e8e
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	71d7d55e-97a5-453b-b8d7-0b9d00e2cc7a
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	8d81215e-1ef3-47b7-a176-1eafcfcfd84d
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	b21f9d89-4244-4ea9-aefe-37a6d662bdee
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	9a681921-33cf-4fce-ac98-f9e59bbadd57
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	07484fe3-0fc0-4a82-b3f2-0437022bc905
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	dd054b69-e42d-4714-a258-ebc80410e07d
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	9fac9676-04be-460d-9e96-c142f2bce185
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	8dd73e70-9104-4856-a811-85225880f015
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	96b4f471-710a-4dc7-82f2-55f1dc336720
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	183ee6f0-e26f-4374-9cd0-9294ef1c0d75
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	7df2c074-3d5e-40bf-9ce3-31a9537882c2
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	9c47a66d-e624-4288-8581-8c38c1fda2c9
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	f903bc56-817b-4935-a354-c61989cf5e8d
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	1654b1fd-5a66-4661-9b76-184e2f267e53
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	2fd1aeb9-9c6d-45da-ba7c-5bb3668fc540
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	b093e2be-33d7-4c18-9d89-427e6ec7de1e
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	2d6a1a29-dbe8-48fe-9085-c67513b074a8
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	6af91a7c-6e00-430b-be8d-cea1de9c360f
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	068a7007-8191-41be-becf-49e20e697275
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	fededd22-fa8b-491e-8b0c-9a05dfd29741
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	152e883c-d2a2-43e6-878a-5f897ef57d51
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	7ca17d30-c21a-45b2-937a-3f36a34126e2
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	c29b517f-5617-4355-907f-b37924da0b86
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (id, key, name, description, created_at, updated_at) FROM stdin;
27c41c60-f10b-4f82-aa33-aba4b8b8a53d	viewer	Viewer	\N	2026-06-22 22:10:08.252799	2026-06-22 22:10:08.252799
fa029ecf-dd24-4aa8-802f-827f0c75df7f	scheduler	Schedule	\N	2026-06-22 22:10:08.266153	2026-06-22 22:10:08.266153
671b09ab-90de-4541-8440-cd30c4f06036	manager	Manager	\N	2026-06-22 22:10:08.274796	2026-06-22 22:10:08.274796
11e7ed4c-fd9d-4136-9bb2-6eaa638b801d	admin	Admin	\N	2026-06-22 22:10:08.282823	2026-06-22 22:10:08.282823
\.


--
-- Data for Name: shift_assignment_confirmations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shift_assignment_confirmations (id, work_order_id, shift_id, role_id, worker_id, token, status, delivery_channel, requested_at, responded_at, last_message, last_sent_to, created_at, updated_at, provider_message_sid, delivery_status, delivery_error, delivered_at) FROM stdin;
\.


--
-- Data for Name: shift_chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shift_chat_messages (id, work_order_id, shift_id, sender_user_id, sender_worker_id, sender_name, kind, body, media_url, media_name, media_content_type, media_size, created_at, updated_at, reply_to_message_id, reply_to_sender_name, reply_to_kind, reply_to_preview) FROM stdin;
\.


--
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shifts (id, name, type, start_time, end_time, duration_hours, status, created_at, updated_at) FROM stdin;
shift_day	Day Shift	standard	07:00	16:00	9	active	2026-06-22 22:23:19.417788	2026-06-22 22:23:19.417788
shift_night	Night Shift	standard	19:00	04:00	9	active	2026-06-22 22:23:19.433671	2026-06-22 22:23:19.433671
shift_swing	Swing Shift	standard	15:00	00:00	9	active	2026-06-22 22:23:19.453389	2026-06-22 22:23:19.453389
shift_on_call	On Call	on_call	\N	\N	\N	active	2026-06-22 22:23:19.465152	2026-06-22 22:23:19.465152
shift_weekend	Weekend Shift	temporary	06:00	14:00	8	inactive	2026-06-22 22:23:19.479196	2026-06-22 22:23:19.479196
\.


--
-- Data for Name: skills; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.skills (id, name, description, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: status_catalog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.status_catalog (id, scope, value, name, color, sort_order, blocks_editing, triggers_notification, requires_approval, status, created_at, updated_at, automatic) FROM stdin;
ws_pending	work_status	pending	Pending	#F59E0B	10	f	f	f	active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	f
ws_confirmed	work_status	confirmed	Confirmed	#22C55E	20	f	f	f	active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	f
ws_declined	work_status	declined	Declined	#EF4444	30	f	t	f	active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	f
ws_not_available	work_status	not_available	Not Available	#6B7280	40	f	f	f	active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	f
mat_available	material	available	Available	#22C55E	10	f	f	f	active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	f
mat_assigned	material	assigned	Assigned	#F59E0B	20	f	t	f	active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	f
mat_maintenance	material	maintenance	Maintenance	#EF4444	30	f	t	t	active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	f
mat_retired	material	retired	Retired	#6B7280	40	t	f	f	active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916	f
wo_draft	work_order	draft	Draft	#94A3B8	10	f	f	f	active	2026-06-22 22:23:19.582368	2026-06-22 22:23:19.582368	f
wo_scheduled	work_order	scheduled	Scheduled	#3B82F6	20	f	t	f	active	2026-06-22 22:23:19.599279	2026-06-22 22:23:19.599279	f
wo_assigned	work_order	assigned	Assigned	#6366F1	30	f	t	f	active	2026-06-22 22:23:19.705008	2026-06-22 22:23:19.705008	f
wo_in_progress	work_order	in_progress	In Progress	#0EA5E9	40	f	f	f	active	2026-06-22 22:23:19.765642	2026-06-22 22:23:19.765642	f
wo_completed	work_order	completed	Completed	#6B7280	50	f	t	t	active	2026-06-22 22:23:19.780441	2026-06-22 22:23:19.780441	f
wo_approved	work_order	approved	Approved	#16A34A	60	f	f	f	active	2026-06-22 22:23:19.793931	2026-06-22 22:23:19.793931	f
wo_closed	work_order	closed	Closed	#334155	70	t	f	f	active	2026-06-22 22:23:19.808184	2026-06-22 22:23:19.808184	f
wo_cancelled	work_order	cancelled	Cancelled	#EF4444	80	t	t	f	active	2026-06-22 22:23:19.820594	2026-06-22 22:23:19.820594	f
ts_pending	timesheet	pending	Pending	#F59E0B	10	f	f	t	active	2026-06-22 22:23:19.880858	2026-06-22 22:23:19.880858	f
ts_submitted	timesheet	submitted	Submitted	#3B82F6	20	f	t	t	active	2026-06-22 22:23:19.89482	2026-06-22 22:23:19.89482	f
ts_reviewed	timesheet	reviewed	Reviewed	#8B5CF6	30	f	f	t	active	2026-06-22 22:23:19.90827	2026-06-22 22:23:19.90827	f
ts_approved	timesheet	approved	Approved	#22C55E	40	t	t	f	active	2026-06-22 22:23:19.920314	2026-06-22 22:23:19.920314	f
ts_rejected	timesheet	rejected	Rejected	#EF4444	50	t	t	f	active	2026-06-22 22:23:19.933238	2026-06-22 22:23:19.933238	f
pj_pending	project	pending	Pending	#F59E0B	10	f	f	f	active	2026-06-22 22:23:19.945462	2026-06-22 22:23:19.945462	f
pj_confirmed	project	confirmed	Confirmed	#22C55E	20	f	f	f	active	2026-06-22 22:23:19.955227	2026-06-22 22:23:19.955227	f
pj_in_progress	project	in_progress	In Progress	#3B82F6	30	f	f	f	active	2026-06-22 22:23:19.968698	2026-06-22 22:23:19.968698	f
pj_completed	project	completed	Completed	#6B7280	40	f	f	f	active	2026-06-22 22:23:19.981857	2026-06-22 22:23:19.981857	f
pj_cancelled	project	cancelled	Cancelled	#EF4444	50	t	t	f	active	2026-06-22 22:23:19.998961	2026-06-22 22:23:19.998961	f
eq_available	equipment	available	Available	#22C55E	10	f	f	f	active	2026-06-22 22:23:20.012066	2026-06-22 22:23:20.012066	f
eq_assigned	equipment	assigned	Assigned	#F59E0B	20	f	t	f	active	2026-06-22 22:23:20.027586	2026-06-22 22:23:20.027586	f
eq_maintenance	equipment	maintenance	Maintenance	#EF4444	30	f	t	t	active	2026-06-22 22:23:20.042801	2026-06-22 22:23:20.042801	f
eq_retired	equipment	retired	Retired	#6B7280	40	t	f	f	active	2026-06-22 22:23:20.053193	2026-06-22 22:23:20.053193	f
ar_pending	availability_request	pending	Pending	#F59E0B	10	f	f	t	active	2026-06-22 22:23:20.065652	2026-06-22 22:23:20.065652	f
ar_approved	availability_request	approved	Approved	#22C55E	20	t	t	f	active	2026-06-22 22:23:20.084188	2026-06-22 22:23:20.084188	f
ar_denied	availability_request	denied	Denied	#EF4444	30	t	t	f	active	2026-06-22 22:23:20.097474	2026-06-22 22:23:20.097474	f
ic_open	incident	open	Open	#EF4444	10	f	t	f	active	2026-06-22 22:23:20.111993	2026-06-22 22:23:20.111993	f
ic_investigating	incident	investigating	Investigating	#F59E0B	20	f	t	f	active	2026-06-22 22:23:20.130509	2026-06-22 22:23:20.130509	f
ic_resolved	incident	resolved	Resolved	#22C55E	30	f	t	f	active	2026-06-22 22:23:20.144176	2026-06-22 22:23:20.144176	f
ic_closed	incident	closed	Closed	#6B7280	40	t	f	f	active	2026-06-22 22:23:20.166589	2026-06-22 22:23:20.166589	f
fs_submitted	form_submission	submitted	Submitted	#F59E0B	10	f	t	t	active	2026-06-22 22:23:20.180636	2026-06-22 22:23:20.180636	f
fs_reviewed	form_submission	reviewed	Reviewed	#22C55E	20	f	f	f	active	2026-06-22 22:23:20.199505	2026-06-22 22:23:20.199505	f
fs_flagged	form_submission	flagged	Flagged	#EF4444	30	f	t	t	active	2026-06-22 22:23:20.219196	2026-06-22 22:23:20.219196	f
shift_customer_pending	shift	customer_pending	Customer Pending	#F97316	10	f	f	f	active	2026-07-17 17:33:52.312043	2026-07-17 17:33:52.312043	f
shift_dispatch_pending	shift	dispatch_pending	Dispatch Pending	#EAB308	20	f	f	f	active	2026-07-17 17:33:52.312043	2026-07-17 17:33:52.312043	f
shift_ready_to_notify	shift	ready_to_notify	Ready to Notify	#3B82F6	30	f	f	t	active	2026-07-17 17:33:52.312043	2026-07-17 17:33:52.312043	f
shift_awaiting_response	shift	awaiting_response	Awaiting Response	#8B5CF6	40	f	f	t	active	2026-07-17 17:33:52.312043	2026-07-17 17:33:52.312043	t
shift_workers_confirmed	shift	workers_confirmed	Workers Confirmed	#22C55E	50	f	f	f	active	2026-07-17 17:33:52.312043	2026-07-17 17:33:52.312043	t
shift_cancelled	shift	shift_cancelled	Shift Cancelled	#EF4444	60	t	f	f	active	2026-07-17 17:33:52.312043	2026-07-17 17:33:52.312043	t
shift_pending	shift	pending	Pending	#F59E0B	10	f	f	f	active	2026-07-17 17:34:49.691072	2026-07-17 17:34:49.691072	f
shift_partially_confirmed	shift	partially_confirmed	Partially Confirmed	#3B82F6	20	f	t	f	active	2026-07-17 17:34:49.719632	2026-07-17 17:34:49.719632	f
shift_confirmed	shift	confirmed	Confirmed	#22C55E	30	f	t	f	active	2026-07-17 17:34:49.745998	2026-07-17 17:34:49.745998	f
shift_in_progress	shift	in_progress	In Progress	#0EA5E9	40	f	f	f	active	2026-07-17 17:34:49.770502	2026-07-17 17:34:49.770502	f
shift_completed	shift	completed	Completed	#334155	50	f	f	f	active	2026-07-17 17:33:52.312043	2026-07-17 17:34:49.785756	t
shift_pm_approved	shift	pm_approved	PM Approved	#14B8A6	80	t	f	f	active	2026-10-15 11:14:34.48134	2026-10-15 11:14:34.48134	t
\.


--
-- Data for Name: timesheets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.timesheets (id, worker_id, project_id, work_order_id, date, clock_in, clock_out, break_minutes, regular_hours, overtime_hours, double_time_hours, status, approved_by, rejected_reason, notes, created_at, updated_at, shift_id, lunch_taken, employee_note, signature, variant, source_submission_id, manually_edited) FROM stdin;
ts_4b7211bfab7aca86190941e1063f55a8c1b2fffc_client	qa-wo-1792062985410-worker		qa-wo-1792062985410-before	2026-10-15	08:00	16:00	30	7.50	0.00	0.00	pending				2026-10-15 11:16:30.734907	2026-10-15 11:16:30.734907	qa-wo-1792062985410-before-shift	t			client	qa-wo-1792062985410-before-submission	f
ts_4bcb3925dbd7910e13852fb51d9cedb870df0d48_internal	qa-wo-1792062985410-worker		qa-wo-1792062985410-before	2026-10-15	08:00	16:00	30	7.50	0.00	0.00	pending				2026-10-15 11:16:30.750904	2026-10-15 11:16:30.750904	qa-wo-1792062985410-before-shift	t			internal	qa-wo-1792062985410-before-submission	f
ts_507e5c0423acd07bfb5f7bc0c9e0a257b51fe8e7_client	qa-wo-1792062985410-worker		qa-wo-1792062985410-after	2026-10-15	08:00	16:00	30	7.50	0.00	0.00	pending				2026-10-15 11:16:31.33787	2026-10-15 11:16:31.33787	qa-wo-1792062985410-after-shift	t			client	qa-wo-1792062985410-after-submission	f
ts_5d80c232d6b7bba5f7bd1559cb031430c76d29bf_internal	qa-wo-1792062985410-worker		qa-wo-1792062985410-after	2026-10-15	08:00	16:00	30	7.50	0.00	0.00	pending				2026-10-15 11:16:31.351799	2026-10-15 11:16:31.351799	qa-wo-1792062985410-after-shift	t			internal	qa-wo-1792062985410-after-submission	f
ts_68da00976480833d2a454741fbe8d6f8a48f7114_client	qa-shift-number-1792067132035-worker		qa-shift-number-1792067132035	2026-10-15	08:00	16:00	30	7.50	0.00	0.00	pending				2026-10-15 12:25:40.877267	2026-10-15 12:25:40.877267	qa-shift-number-1792067132035-shift-1	t			client	qa-shift-number-1792067132035-submission-1	f
ts_0e8c7fc382343651176cf73e806a596081e14963_internal	qa-shift-number-1792067132035-worker		qa-shift-number-1792067132035	2026-10-15	08:00	16:00	30	7.50	0.00	0.00	pending				2026-10-15 12:25:40.886314	2026-10-15 12:25:40.886314	qa-shift-number-1792067132035-shift-1	t			internal	qa-shift-number-1792067132035-submission-1	f
ts_2ee891b020a55f192e90ab86ab5618cd070f5abc_client	qa-shift-number-1792067132035-worker		qa-shift-number-1792067132035	2026-10-15	08:00	16:00	30	7.50	0.00	0.00	pending				2026-10-15 12:25:41.20862	2026-10-15 12:25:41.20862	qa-shift-number-1792067132035-shift-2	t			client	qa-shift-number-1792067132035-submission-2	f
ts_73ca5ccb129324a4e0e154a7c1f4646d0d6b0b37_internal	qa-shift-number-1792067132035-worker		qa-shift-number-1792067132035	2026-10-15	08:00	16:00	30	7.50	0.00	0.00	pending				2026-10-15 12:25:41.218518	2026-10-15 12:25:41.218518	qa-shift-number-1792067132035-shift-2	t			internal	qa-shift-number-1792067132035-submission-2	f
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (user_id, role_id) FROM stdin;
4a7705bc-5380-4145-be01-55c72ae17166	11e7ed4c-fd9d-4136-9bb2-6eaa638b801d
5805f0db-cfcd-4324-8858-4d57fe4e7d46	671b09ab-90de-4541-8440-cd30c4f06036
10e03521-0377-4358-8e03-73c5ca75f91c	fa029ecf-dd24-4aa8-802f-827f0c75df7f
a4e74dcc-e9ee-4671-a003-4cd33465f684	27c41c60-f10b-4f82-aa33-aba4b8b8a53d
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, first_name, last_name, phone, avatar_url, status, last_login, created_at, updated_at) FROM stdin;
10e03521-0377-4358-8e03-73c5ca75f91c	mike@drtrafficcontrol.com	$2b$10$ALPUebsoh8IsajFI4kxi9u80uBuD77t90IcrepA1/kKWHtQ1JdFvu	Mike	Rodriguez	(555) 100-0003	\N	active	\N	2026-06-22 22:23:20.861319	2026-06-22 22:23:20.861319
a4e74dcc-e9ee-4671-a003-4cd33465f684	jenny@drtrafficcontrol.com	$2b$10$imxlG5EhbmCXjDCC0jqWkOlslV1.hcZ9TB1b4RIiIsHS2zUDXJW5m	Jenny	Park	(555) 100-0004	\N	active	\N	2026-06-22 22:23:20.980376	2026-06-22 22:23:20.980376
5805f0db-cfcd-4324-8858-4d57fe4e7d46	sarah@drtrafficcontrol.com	$2b$10$XDf9ydQSdvWaT0AYOzM73u1dE7/MkblteRGR1NkVzNDr32IQFIRh6	Sarah	Mitchell	(555) 100-0002	\N	active	2026-07-01 09:24:53.714	2026-06-22 22:23:20.626527	2026-07-01 15:24:54.054883
4a7705bc-5380-4145-be01-55c72ae17166	derek@drtrafficcontrol.com	$2b$10$fspw0wNxq6.AjXosvlOTC.okcUAkyYWZy0qlVnWQUQ5CWSp7Kvg4y	Derek	Doan	(555) 100-0001	\N	active	2026-07-17 12:56:52.555	2026-06-22 22:23:20.444923	2026-07-17 18:56:52.576983
\.


--
-- Data for Name: work_order_sequences; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.work_order_sequences (scope, last_value, reset_key, updated_at) FROM stdin;
work_order	2	2026	2026-10-15 11:16:31.243999
\.


--
-- Data for Name: work_order_shift_role_workers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.work_order_shift_role_workers (role_id, worker_id, confirmation_status, requested_at, responded_at, notification_channel, created_at, updated_at) FROM stdin;
sr_bulk_1782255507337_20260623_0	wkr_demo_fernando	pending	\N	\N	\N	2026-06-23 22:58:27.344798+00	2026-06-23 22:58:27.344798+00
sr_bulk_1782255507337_20260623_1	wkr_demo_rolando	pending	\N	\N	\N	2026-06-23 22:58:27.344798+00	2026-06-23 22:58:27.344798+00
sr_bulk_1782255507337_20260624_0	wkr_demo_fernando	pending	\N	\N	\N	2026-06-23 22:58:27.344798+00	2026-06-23 22:58:27.344798+00
sr_bulk_1782255507337_20260624_1	wkr_demo_rolando	pending	\N	\N	\N	2026-06-23 22:58:27.344798+00	2026-06-23 22:58:27.344798+00
r_demo_1_flagger	wkr_demo_fernando	confirmed	\N	2026-06-21 15:00:00+00	sms	2026-07-17 17:34:50.514568+00	2026-07-17 17:34:50.514568+00
r_demo_1_flagger	wkr_demo_rolando	pending	\N	\N	\N	2026-07-17 17:34:50.5509+00	2026-07-17 17:34:50.5509+00
r_demo_2_flagger	wkr_demo_fernando	confirmed	\N	2026-06-21 15:00:00+00	sms	2026-07-17 17:34:50.83602+00	2026-07-17 17:34:50.83602+00
r_demo_2_flagger	wkr_demo_rolando	confirmed	\N	2026-06-21 15:00:00+00	sms	2026-07-17 17:34:50.867149+00	2026-07-17 17:34:50.867149+00
r_demo_2_lead	wkr_demo_jhon	pending	\N	\N	\N	2026-07-17 17:34:51.150215+00	2026-07-17 17:34:51.150215+00
r_demo_3_flagger	wkr_demo_rolando	pending	\N	\N	\N	2026-07-17 17:34:51.251349+00	2026-07-17 17:34:51.251349+00
\.


--
-- Data for Name: work_order_shift_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.work_order_shift_roles (id, shift_id, role_name, required_count, start_time, required_certification_ids, required_skill_ids, created_at, updated_at) FROM stdin;
sr_bulk_1782255507337_20260623_0	s_bulk_1782255507337_20260623	Flagger	1	07:00	{}	{}	2026-06-23 22:58:27.344798+00	2026-06-23 22:58:27.344798+00
sr_bulk_1782255507337_20260623_1	s_bulk_1782255507337_20260623	Lead	1	07:00	{}	{}	2026-06-23 22:58:27.344798+00	2026-06-23 22:58:27.344798+00
sr_bulk_1782255507337_20260624_0	s_bulk_1782255507337_20260624	Flagger	1	07:00	{}	{}	2026-06-23 22:58:27.344798+00	2026-06-23 22:58:27.344798+00
sr_bulk_1782255507337_20260624_1	s_bulk_1782255507337_20260624	Lead	1	07:00	{}	{}	2026-06-23 22:58:27.344798+00	2026-06-23 22:58:27.344798+00
r_demo_1_flagger	s_demo_1	Flagger	2	07:00	{}	{}	2026-07-17 17:34:50.473727+00	2026-07-17 17:34:50.473727+00
r_demo_2_flagger	s_demo_2	Flagger	2	07:00	{}	{}	2026-07-17 17:34:50.803628+00	2026-07-17 17:34:50.803628+00
r_demo_2_lead	s_demo_2	Lead	1	07:00	{}	{}	2026-07-17 17:34:51.085757+00	2026-07-17 17:34:51.085757+00
r_demo_3_flagger	s_demo_3	Flagger	2	07:00	{}	{}	2026-07-17 17:34:51.224382+00	2026-07-17 17:34:51.224382+00
sr_1784310043856_Flagger	s_cal_1784310043856	Flagger	1	07:00	{}	{}	2026-07-17 17:40:43.915721+00	2026-07-17 17:40:43.915721+00
\.


--
-- Data for Name: work_order_shifts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.work_order_shifts (id, work_order_id, date, start_time, end_time, default_role_start_time, shift_template_id, created_at, updated_at, status, created_by_user_id, requester_user_id, address, address_latitude, address_longitude, address_city, address_state, address_zip_code, address_country, requester_name, visible_document_types, notes, cancelled, cross_street_location_detail, planned_equipment, planned_materials, requester_phone, requester_email, shift_name, work_order_authorized_worker_ids, work_order_types, client_timesheet_notes, internal_timesheet_notes, pm_approved_at, pm_approved_by_user_id, confirmation_reset_reason, display_order, form_template_ids) FROM stdin;
s_demo_3	wo_demo_asn_2026_856	2026-06-24	07:00	15:30	07:00	shift_day	2026-07-17 17:34:51.18885+00	2026-07-17 17:34:51.18885+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	[]	\N	f	\N	[]	[]	\N	\N	Shift 2026-06-24	[]	[]			\N	\N	\N	4	{}
s_bulk_1782255507337_20260624	wo_demo_asn_2026_856	2026-06-24	07:00	16:00	07:00	shift_on_call	2026-06-23 22:58:27.344798+00	2026-06-23 22:58:27.344798+00	customer_pending	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	[]	\N	f	\N	[]	[]	\N	\N	Shift 2026-06-24	[]	[]			\N	\N	\N	3	{}
s_demo_2	wo_demo_asn_2026_856	2026-06-23	07:00	15:30	07:00	shift_day	2026-07-17 17:34:50.654149+00	2026-07-17 17:34:50.654149+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	[]	\N	f	\N	[]	[]	\N	\N	Shift 2026-06-23	[]	[]			\N	\N	\N	2	{}
s_bulk_1782255507337_20260623	wo_demo_asn_2026_856	2026-06-23	07:00	16:00	07:00	shift_on_call	2026-06-23 22:58:27.344798+00	2026-06-23 22:58:27.344798+00	customer_pending	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	[]	\N	f	\N	[]	[]	\N	\N	Shift 2026-06-23	[]	[]			\N	\N	\N	1	{}
s_demo_1	wo_demo_asn_2026_856	2026-06-22	07:00	15:30	07:00	shift_day	2026-07-17 17:34:50.426001+00	2026-07-17 17:34:50.426001+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	[]	\N	f	\N	[]	[]	\N	\N	Shift 2026-06-22	[]	[]			\N	\N	\N	0	{}
s_cal_1784310043856	wo_new_1784310002850	2026-07-17	07:00	16:00	07:00	shift_on_call	2026-07-17 17:40:43.915721+00	2026-07-17 17:40:43.915721+00	customer_pending	4a7705bc-5380-4145-be01-55c72ae17166	\N	CA-1, Malibu, CA, EE. UU.	34.0304616	-118.7535476	Malibu	CA		Estados Unidos	rolas	[]	\N	f	\N	[]	[]	\N	\N	Shift 2026-07-17	[]	[]			\N	\N	\N	0	{work_order_daily_completion}
\.


--
-- Data for Name: work_order_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.work_order_types (id, name, description, status, created_at, updated_at) FROM stdin;
wot_traffic_control	Traffic Control	General traffic control scope	active	2026-06-22 22:23:19.501032	2026-06-22 22:23:19.501032
wot_lane_closure	Lane Closure	Single or multi-lane closure operations	active	2026-06-22 22:23:19.516659	2026-06-22 22:23:19.516659
wot_emergency_response	Emergency Response	Rapid-response traffic support for incidents	active	2026-06-22 22:23:19.530481	2026-06-22 22:23:19.530481
wot_flagging_operation	Flagging Operation	Flagger-led traffic management operation	active	2026-06-22 22:23:19.543235	2026-06-22 22:23:19.543235
wot_night_shift_support	Night Shift Support	Night operations and overnight coverage	active	2026-06-22 22:23:19.560544	2026-06-22 22:23:19.560544
\.


--
-- Data for Name: work_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.work_orders (id, project_id, work_order_type_id, title, order_number, status, start_date, end_date, requester_name, contact_email, contact_phone_number, notes, dispatch_note, file_uploads, attachments, created_at, updated_at, assignment_address, latitude, longitude, assignment_city, assignment_state, assignment_zip_code, assignment_country, deleted_at) FROM stdin;
wo_demo_asn_2026_856	proj_demo_pge	\N	PG&E Lane Closure - Week 24	ASN-2026-856	confirmed	2026-06-22	2026-06-28	PG&E Dispatch	dispatch@pge.com	+14155550100	Shift lane. Pickup cones and material Traffic control support		{}	{}	2026-06-22 22:23:21.271824	2026-07-17 17:34:50.375247	1366 Palou Ave	37.737	-122.387	San Francisco	CA	94124	USA	\N
wo_new_1784310002850	proj_demo_pge	wot_emergency_response	example 1	ASN-2026-001		2026-07-17	2026-07-22	rolas	dev.ro@gmail.com	846464			{}	{}	2026-07-17 17:40:02.94497	2026-07-17 17:40:02.94497	CA-1, Malibu, CA, EE. UU.	34.0304616	-118.7535476	Malibu	CA		Estados Unidos	\N
qa-wo-1792062985410-before		\N	QA API Numbering before	ASN-2026-0001		2026-10-15	2026-10-15				TEST ONLY - local Settings/PDF verification		{}	{}	2026-10-15 11:16:30.687545	2026-10-15 11:16:30.687545		\N	\N				USA	\N
qa-wo-1792062985410-after		\N	QA API Numbering after	000002		2026-10-15	2026-10-15				TEST ONLY - local Settings/PDF verification		{}	{}	2026-10-15 11:16:31.270573	2026-10-15 11:16:31.270573		\N	\N				USA	\N
qa-shift-number-1792067132035		\N	QA same assignment, two shift WOs	ASN-2026-001		2026-10-15	2026-10-16						{}	{}	2026-10-15 12:25:40.765948	2026-10-15 12:25:40.765948		\N	\N				USA	\N
\.


--
-- Data for Name: worker_certifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_certifications (worker_id, certification_id, expiration_date) FROM stdin;
\.


--
-- Data for Name: worker_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_roles (id, name, description, status, created_at, updated_at) FROM stdin;
worker_role_flagger	Flagger		active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916
worker_role_lead	Lead		active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916
worker_role_striper	Striper		active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916
worker_role_tma_driver	TMA Driver		active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916
worker_role_freeway_cone_setter	Freeway Cone Setter		active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916
worker_role_pole_depole	Pole/Depole		active	2026-06-22 21:17:17.494916	2026-06-22 21:17:17.494916
\.


--
-- Data for Name: worker_skills; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_skills (worker_id, skill_id) FROM stdin;
\.


--
-- Data for Name: worker_worker_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_worker_roles (worker_id, worker_role_id) FROM stdin;
wkr_demo_rolando	worker_role_flagger
wkr_demo_rolando	worker_role_lead
\.


--
-- Data for Name: workers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workers (id, first_name, last_name, email, phone, driver_license, primary_address, city, zip_code, state, type, role, status, file_uploads, hire_date, hourly_rate, avatar, emergency_contact, notes, created_at, updated_at, latitude, longitude, country, driver_license_expiration, fcm_tokens, user_id) FROM stdin;
wkr_demo_fernando	Fernando	Perez	fernando@example.com	+15125550100			San Francisco	94124	CA	Flagger	Flagger	active	{}	\N	22.50	\N	\N		2026-06-22 22:23:21.110987	2026-06-22 22:23:21.110987	\N	\N	USA	\N	{}	\N
wkr_demo_jhon	Jhon	Doe	jhon@example.com	+15125550102			San Francisco	94124	CA	Flagger	Flagger	active	{}	\N	20.00	\N	\N		2026-06-22 22:23:21.148749	2026-06-22 22:23:21.148749	\N	\N	USA	\N	{}	\N
wkr_demo_rolando	Rolando	Sanchez	rolando@example.com	(512) 555-0101			San Francisco	94124	CA	Flagger	Flagger	active	{}	2026-06-23	21.00	\N	\N		2026-06-22 22:23:21.129987	2026-06-23 22:57:31.547111	\N	\N	USA	\N	{}	\N
qa-wo-1792062985410-worker	QA	Numbering Test	qa-wo-1792062985410-worker@example.test	(415) 555-0100						Full Time	Flagger	active	{}	\N	0.00	\N	\N	Local API numbering verification only	2026-10-15 11:16:30.391001	2026-10-15 11:16:30.391001	\N	\N	USA	\N	{}	\N
qa-shift-number-1792067132035-worker	QA	Shift Numbering	qa-shift-number-1792067132035-worker@example.test	(415) 555-0100						Full Time	Flagger	active	{}	\N	0.00	\N	\N		2026-10-15 12:25:40.808532	2026-10-15 12:25:40.808532	\N	\N	USA	\N	{}	\N
\.


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.migrations_id_seq', 83, true);


--
-- Name: commercial_catalog_items PK_01d8286c2e6aab3a563af2a8c6d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_catalog_items
    ADD CONSTRAINT "PK_01d8286c2e6aab3a563af2a8c6d" PRIMARY KEY (id);


--
-- Name: company_settings PK_036b4634217db79c17305442dbe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT "PK_036b4634217db79c17305442dbe" PRIMARY KEY (id);


--
-- Name: equipment PK_0722e1b9d6eb19f5874c1678740; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT "PK_0722e1b9d6eb19f5874c1678740" PRIMARY KEY (id);


--
-- Name: timesheets PK_1dc280b68c9353ecce41a34be71; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets
    ADD CONSTRAINT "PK_1dc280b68c9353ecce41a34be71" PRIMARY KEY (id);


--
-- Name: user_roles PK_23ed6f04fe43066df08379fd034; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "PK_23ed6f04fe43066df08379fd034" PRIMARY KEY (user_id, role_id);


--
-- Name: role_permissions PK_25d24010f53bb80b78e412c9656; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "PK_25d24010f53bb80b78e412c9656" PRIMARY KEY (role_id, permission_id);


--
-- Name: work_orders PK_29f6c1884082ee6f535aed93660; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT "PK_29f6c1884082ee6f535aed93660" PRIMARY KEY (id);


--
-- Name: materials PK_2fd1a93ecb222a28bef28663fa0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT "PK_2fd1a93ecb222a28bef28663fa0" PRIMARY KEY (id);


--
-- Name: status_catalog PK_3cd164e4ea4b993994152208a52; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_catalog
    ADD CONSTRAINT "PK_3cd164e4ea4b993994152208a52" PRIMARY KEY (id);


--
-- Name: commercial_invoices PK_52ba9d1e518bdb375931d99f4d5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_invoices
    ADD CONSTRAINT "PK_52ba9d1e518bdb375931d99f4d5" PRIMARY KEY (id);


--
-- Name: shift_assignment_confirmations PK_59e682aefdf9175ee7ccc175191; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignment_confirmations
    ADD CONSTRAINT "PK_59e682aefdf9175ee7ccc175191" PRIMARY KEY (id);


--
-- Name: projects PK_6271df0a7aed1d6c0691ce6ac50; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY (id);


--
-- Name: notifications PK_6a72c3c0f683f6462415e653c3a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id);


--
-- Name: shifts PK_84d692e367e4d6cdf045828768c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT "PK_84d692e367e4d6cdf045828768c" PRIMARY KEY (id);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: work_order_types PK_8ed4eeb469eec59a95136215184; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_types
    ADD CONSTRAINT "PK_8ed4eeb469eec59a95136215184" PRIMARY KEY (id);


--
-- Name: permissions PK_920331560282b8bd21bb02290df; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: project_types PK_a92511c5000b6b331876bbbce08; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_types
    ADD CONSTRAINT "PK_a92511c5000b6b331876bbbce08" PRIMARY KEY (id);


--
-- Name: activity_feed PK_b772f66cacd352e98fba04a7b8a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_feed
    ADD CONSTRAINT "PK_b772f66cacd352e98fba04a7b8a" PRIMARY KEY (id);


--
-- Name: roles PK_c1433d71a4838793a49dcad46ab; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY (id);


--
-- Name: commercial_work_orders PK_cc4e5d108befe558c5e2d000b25; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_work_orders
    ADD CONSTRAINT "PK_cc4e5d108befe558c5e2d000b25" PRIMARY KEY (id);


--
-- Name: incidents PK_ccb34c01719889017e2246469f9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT "PK_ccb34c01719889017e2246469f9" PRIMARY KEY (id);


--
-- Name: form_templates PK_dda93f70be71cb4a2e496b5ae49; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_templates
    ADD CONSTRAINT "PK_dda93f70be71cb4a2e496b5ae49" PRIMARY KEY (id);


--
-- Name: workers PK_e950c9aba3bd84a4f193058d838; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT "PK_e950c9aba3bd84a4f193058d838" PRIMARY KEY (id);


--
-- Name: availability_requests PK_e9698119de563fd44cd809f2ef1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_requests
    ADD CONSTRAINT "PK_e9698119de563fd44cd809f2ef1" PRIMARY KEY (id);


--
-- Name: clients PK_f1ab7cf3a5714dbc6bb4e1c28a4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY (id);


--
-- Name: work_order_sequences PK_f2ac1933f6720f27cf2b40c8471; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_sequences
    ADD CONSTRAINT "PK_f2ac1933f6720f27cf2b40c8471" PRIMARY KEY (scope, reset_key);


--
-- Name: form_submissions PK_fb6e1e9f26cda31c358a8a1530e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT "PK_fb6e1e9f26cda31c358a8a1530e" PRIMARY KEY (id);


--
-- Name: shift_chat_messages PK_fb95a2c081f33ba370151240b67; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_chat_messages
    ADD CONSTRAINT "PK_fb95a2c081f33ba370151240b67" PRIMARY KEY (id);


--
-- Name: permissions UQ_017943867ed5ceef9c03edd9745; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT "UQ_017943867ed5ceef9c03edd9745" UNIQUE (key);


--
-- Name: commercial_invoices UQ_2369a1ba12133950b7a0decba03; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_invoices
    ADD CONSTRAINT "UQ_2369a1ba12133950b7a0decba03" UNIQUE (invoice_number);


--
-- Name: commercial_work_orders UQ_4bd0a99bb1aed43e3236c17f56e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_work_orders
    ADD CONSTRAINT "UQ_4bd0a99bb1aed43e3236c17f56e" UNIQUE (work_order_number);


--
-- Name: commercial_catalog_items UQ_891ddfb8b2736f6651c8fbdd5bf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_catalog_items
    ADD CONSTRAINT "UQ_891ddfb8b2736f6651c8fbdd5bf" UNIQUE (sku);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: roles UQ_a87cf0659c3ac379b339acf36a2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "UQ_a87cf0659c3ac379b339acf36a2" UNIQUE (key);


--
-- Name: certifications certifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certifications
    ADD CONSTRAINT certifications_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens uq_password_reset_tokens_token_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT uq_password_reset_tokens_token_hash UNIQUE (token_hash);


--
-- Name: work_order_shift_role_workers work_order_shift_role_workers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_shift_role_workers
    ADD CONSTRAINT work_order_shift_role_workers_pkey PRIMARY KEY (role_id, worker_id);


--
-- Name: work_order_shift_roles work_order_shift_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_shift_roles
    ADD CONSTRAINT work_order_shift_roles_pkey PRIMARY KEY (id);


--
-- Name: work_order_shifts work_order_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_shifts
    ADD CONSTRAINT work_order_shifts_pkey PRIMARY KEY (id);


--
-- Name: worker_certifications worker_certifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_certifications
    ADD CONSTRAINT worker_certifications_pkey PRIMARY KEY (worker_id, certification_id);


--
-- Name: worker_roles worker_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_roles
    ADD CONSTRAINT worker_roles_pkey PRIMARY KEY (id);


--
-- Name: worker_skills worker_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_skills
    ADD CONSTRAINT worker_skills_pkey PRIMARY KEY (worker_id, skill_id);


--
-- Name: worker_worker_roles worker_worker_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_worker_roles
    ADD CONSTRAINT worker_worker_roles_pkey PRIMARY KEY (worker_id, worker_role_id);


--
-- Name: IDX_equipment_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_equipment_deleted_at" ON public.equipment USING btree (deleted_at);


--
-- Name: IDX_materials_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_materials_deleted_at" ON public.materials USING btree (deleted_at);


--
-- Name: IDX_role_permissions_permission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_role_permissions_permission_id" ON public.role_permissions USING btree (permission_id);


--
-- Name: IDX_role_permissions_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_role_permissions_role_id" ON public.role_permissions USING btree (role_id);


--
-- Name: IDX_shift_assignment_confirmations_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_shift_assignment_confirmations_assignment" ON public.shift_assignment_confirmations USING btree (work_order_id, shift_id, role_id, worker_id);


--
-- Name: IDX_shift_assignment_confirmations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_shift_assignment_confirmations_token" ON public.shift_assignment_confirmations USING btree (token);


--
-- Name: IDX_shift_chat_messages_shift_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_shift_chat_messages_shift_created" ON public.shift_chat_messages USING btree (shift_id, created_at);


--
-- Name: IDX_timesheets_shift_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_timesheets_shift_variant" ON public.timesheets USING btree (work_order_id, shift_id, variant);


--
-- Name: IDX_timesheets_work_order_shift_worker_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_timesheets_work_order_shift_worker_unique" ON public.timesheets USING btree (work_order_id, shift_id, worker_id, variant) WHERE (((work_order_id)::text <> ''::text) AND ((shift_id)::text <> ''::text) AND ((worker_id)::text <> ''::text));


--
-- Name: IDX_user_roles_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_user_roles_role_id" ON public.user_roles USING btree (role_id);


--
-- Name: IDX_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_user_roles_user_id" ON public.user_roles USING btree (user_id);


--
-- Name: IDX_work_orders_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_work_orders_deleted_at" ON public.work_orders USING btree (deleted_at);


--
-- Name: idx_password_reset_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_expires_at ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_work_order_shift_roles_shift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_order_shift_roles_shift ON public.work_order_shift_roles USING btree (shift_id);


--
-- Name: idx_work_order_shifts_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_order_shifts_date ON public.work_order_shifts USING btree (date);


--
-- Name: idx_work_order_shifts_work_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_order_shifts_work_order ON public.work_order_shifts USING btree (work_order_id);


--
-- Name: idx_wos_scope_reset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wos_scope_reset ON public.work_order_sequences USING btree (scope, reset_key);


--
-- Name: idx_wosrw_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wosrw_role ON public.work_order_shift_role_workers USING btree (role_id);


--
-- Name: idx_wosrw_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wosrw_worker ON public.work_order_shift_role_workers USING btree (worker_id);


--
-- Name: uq_workers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_workers_user_id ON public.workers USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: role_permissions FK_role_permissions_permission_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "FK_role_permissions_permission_id" FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions FK_role_permissions_role_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "FK_role_permissions_role_id" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles FK_user_roles_role_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "FK_user_roles_role_id" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles FK_user_roles_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "FK_user_roles_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: work_order_shifts FK_work_order_shifts_created_by_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_shifts
    ADD CONSTRAINT "FK_work_order_shifts_created_by_user" FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: work_order_shifts FK_work_order_shifts_requester_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_shifts
    ADD CONSTRAINT "FK_work_order_shifts_requester_user" FOREIGN KEY (requester_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: password_reset_tokens fk_password_reset_tokens_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT fk_password_reset_tokens_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: work_order_shifts fk_work_order_shifts_pm_approved_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_shifts
    ADD CONSTRAINT fk_work_order_shifts_pm_approved_by FOREIGN KEY (pm_approved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: worker_certifications fk_worker_certifications_certification; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_certifications
    ADD CONSTRAINT fk_worker_certifications_certification FOREIGN KEY (certification_id) REFERENCES public.certifications(id) ON DELETE CASCADE;


--
-- Name: worker_certifications fk_worker_certifications_worker; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_certifications
    ADD CONSTRAINT fk_worker_certifications_worker FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: worker_skills fk_worker_skills_skill; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_skills
    ADD CONSTRAINT fk_worker_skills_skill FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: worker_skills fk_worker_skills_worker; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_skills
    ADD CONSTRAINT fk_worker_skills_worker FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: worker_worker_roles fk_worker_worker_roles_role; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_worker_roles
    ADD CONSTRAINT fk_worker_worker_roles_role FOREIGN KEY (worker_role_id) REFERENCES public.worker_roles(id) ON DELETE CASCADE;


--
-- Name: worker_worker_roles fk_worker_worker_roles_worker; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_worker_roles
    ADD CONSTRAINT fk_worker_worker_roles_worker FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: workers fk_workers_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT fk_workers_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: work_order_shift_role_workers work_order_shift_role_workers_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_shift_role_workers
    ADD CONSTRAINT work_order_shift_role_workers_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.work_order_shift_roles(id) ON DELETE CASCADE;


--
-- Name: work_order_shift_role_workers work_order_shift_role_workers_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_shift_role_workers
    ADD CONSTRAINT work_order_shift_role_workers_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: work_order_shift_roles work_order_shift_roles_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_shift_roles
    ADD CONSTRAINT work_order_shift_roles_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.work_order_shifts(id) ON DELETE CASCADE;


--
-- Name: work_order_shifts work_order_shifts_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_shifts
    ADD CONSTRAINT work_order_shifts_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict i8w8Zzr62W9VUxhYtlPlaKIThQCJguVQ0ZtFcehzKj6FlMSBbPISzLa1StyHyzM

