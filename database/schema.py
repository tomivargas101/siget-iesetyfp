from datetime import datetime, date, timezone, timedelta
try:
    from zoneinfo import ZoneInfo
    ARGENTINA_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
except Exception:
    ARGENTINA_TZ = timezone(timedelta(hours=-3))

def get_argentina_now() -> datetime:
    return datetime.now(ARGENTINA_TZ).replace(tzinfo=None)

from sqlalchemy import (
    Column, Integer, String, Boolean, Date, DateTime,
    ForeignKey, Text, Float
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False)
    email = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    security_question = Column(String(255), nullable=True)
    security_answer_hash = Column(String(255), nullable=True)
    recovery_key_hash = Column(String(255), nullable=True)
    recovery_key = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=get_argentina_now)
    last_login = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name,
            "role": self.role,
            "email": self.email,
            "is_active": self.is_active,
            "last_login": self.last_login.strftime("%Y-%m-%d %H:%M:%S") if self.last_login else "Nunca"
        }

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=get_argentina_now, index=True)

    @property
    def local_timestamp(self) -> datetime:
        return self.timestamp

    @property
    def formatted_timestamp(self) -> str:
        return self.timestamp.strftime("%d/%m/%Y %H:%M") if self.timestamp else "-"


class Career(Base):
    __tablename__ = "careers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(20), unique=True, nullable=False)
    name = Column(String(150), nullable=False)
    resolution_number = Column(String(100), nullable=True)
    duration_years = Column(Integer, default=3)

    subjects = relationship("Subject", back_populates="career", cascade="all, delete-orphan")

class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    career_id = Column(Integer, ForeignKey("careers.id"), nullable=False)
    code = Column(String(20), nullable=False)
    name = Column(String(150), nullable=False)
    year_level = Column(Integer, default=1)
    weekly_hours = Column(Integer, default=4)

    career = relationship("Career", back_populates="subjects")
    designations = relationship("Designation", back_populates="subject")

class Teacher(Base):
    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    legajo = Column(String(30), unique=True, nullable=False, index=True)
    dni = Column(String(20), unique=True, nullable=False, index=True)
    cuil = Column(String(25), nullable=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(120), nullable=True)
    phone = Column(String(50), nullable=True)
    revista = Column(String(30), default="Titular", nullable=False)
    max_weekly_hours = Column(Integer, default=30, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=get_argentina_now)

    designations = relationship("Designation", back_populates="teacher")
    attendances = relationship("Attendance", back_populates="teacher", foreign_keys="[Attendance.teacher_id]")

    @property
    def full_name(self):
        return f"{self.last_name}, {self.first_name}"


class Designation(Base):
    __tablename__ = "designations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)
    cargo = Column(String(150), nullable=True)
    revista = Column(String(20), nullable=True)
    day_of_week = Column(String(20), nullable=False)
    start_time = Column(String(10), nullable=False)
    end_time = Column(String(10), nullable=False)
    hours_count = Column(Integer, default=4, nullable=False)
    resolution_number = Column(String(100), nullable=True)
    academic_year = Column(Integer, default=datetime.now().year)
    is_active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)

    subject = relationship("Subject", back_populates="designations")
    teacher = relationship("Teacher", back_populates="designations")
    substitutions = relationship("Substitution", back_populates="designation")
    attendances = relationship("Attendance", back_populates="designation")

    @property
    def effective_revista(self):
        if self.revista:
            from models.normative import NormativeClassifier
            return NormativeClassifier.normalize_revista(self.revista)
        if self.teacher and self.teacher.revista:
            from models.normative import NormativeClassifier
            return NormativeClassifier.normalize_revista(self.teacher.revista)
        return "TIT"

    @property
    def effective_cargo(self):
        if self.cargo:
            return self.cargo
        if self.subject:
            return self.subject.name
        return "Cátedra"

class Substitution(Base):
    __tablename__ = "substitutions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    designation_id = Column(Integer, ForeignKey("designations.id"), nullable=False)
    titular_teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)
    suplente_teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)
    license_reason = Column(String(200), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    resolution_number = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=get_argentina_now)

    designation = relationship("Designation", back_populates="substitutions")
    titular = relationship("Teacher", foreign_keys=[titular_teacher_id])
    suplente = relationship("Teacher", foreign_keys=[suplente_teacher_id])

class Attendance(Base):
    __tablename__ = "attendances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)
    designation_id = Column(Integer, ForeignKey("designations.id"), nullable=True)
    suplente_teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    attachment_filename = Column(String(255), nullable=True)
    attachment_path = Column(Text, nullable=True)
    date = Column(Date, nullable=False, index=True)
    status = Column(String(30), default="Presente", nullable=False)
    hours = Column(Integer, default=4)
    observations = Column(String(255), nullable=True)
    registered_by = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=get_argentina_now)

    teacher = relationship("Teacher", back_populates="attendances", foreign_keys=[teacher_id])
    suplente_teacher = relationship("Teacher", foreign_keys=[suplente_teacher_id])
    designation = relationship("Designation", back_populates="attendances")

