import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    Float,
    DateTime,
    Text,
    ForeignKey,
    Enum as SAEnum,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


# ============================================
# Enums
# ============================================

class PlanEnum(str, enum.Enum):
    FREE = "FREE"
    STARTER = "STARTER"
    PRO = "PRO"
    ENTERPRISE = "ENTERPRISE"


class UserRoleEnum(str, enum.Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"
    VIEWER = "VIEWER"


class ProspectSourceEnum(str, enum.Enum):
    GOOGLE_SEARCH = "GOOGLE_SEARCH"
    GOOGLE_PLACES = "GOOGLE_PLACES"
    SCRAPING = "SCRAPING"
    OPEN_DATA = "OPEN_DATA"
    LINKEDIN = "LINKEDIN"
    MANUAL = "MANUAL"
    API_IMPORT = "API_IMPORT"


class CallStatusEnum(str, enum.Enum):
    UNCALLED = "UNCALLED"
    SKIPPED = "SKIPPED"
    VOICEMAIL = "VOICEMAIL"
    CALL_BACK = "CALL_BACK"
    NOT_INTERESTED = "NOT_INTERESTED"
    INTERESTED = "INTERESTED"
    WRONG_NUMBER = "WRONG_NUMBER"


class CampaignStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


class ChannelEnum(str, enum.Enum):
    EMAIL = "EMAIL"
    LINKEDIN = "LINKEDIN"
    SMS = "SMS"
    CALL = "CALL"


class TemplateTypeEnum(str, enum.Enum):
    AI_GENERATED = "AI_GENERATED"
    MANUAL = "MANUAL"
    HYBRID = "HYBRID"


class AgentTypeEnum(str, enum.Enum):
    SUBJECT = "SUBJECT"
    FIRST_TOUCH = "FIRST_TOUCH"
    FOLLOW_UP = "FOLLOW_UP"
    CLOSER = "CLOSER"
    VISUAL_AUDIT = "VISUAL_AUDIT"


class CampaignProspectStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    CONTACTED = "CONTACTED"
    REPLIED = "REPLIED"
    CONVERTED = "CONVERTED"
    FAILED = "FAILED"
    OPTED_OUT = "OPTED_OUT"


class EmailEventTypeEnum(str, enum.Enum):
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    OPENED = "OPENED"
    CLICKED = "CLICKED"
    REPLIED = "REPLIED"
    BOUNCED = "BOUNCED"
    UNSUBSCRIBED = "UNSUBSCRIBED"
    SPAM_REPORTED = "SPAM_REPORTED"


class AgentTaskStatusEnum(str, enum.Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class ResearchJobStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class JobTypeEnum(str, enum.Enum):
    ENRICHMENT = "ENRICHMENT"
    CLEANER = "CLEANER"
    IMPORT = "IMPORT"


class ImportJobStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class GeneratedMessageStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    SENT = "SENT"
    FAILED = "FAILED"


def generate_uuid() -> str:
    return str(uuid.uuid4())


# ============================================
# Multi-Tenancy & Users
# ============================================

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    plan = Column(SAEnum(PlanEnum, name="Plan"), default=PlanEnum.FREE, nullable=False)
    aiCreditsRemaining = Column(Integer, default=100, nullable=False)
    maxUsers = Column(Integer, default=1, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    prospectLists = relationship("ProspectList", back_populates="tenant", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="tenant", cascade="all, delete-orphan")
    mailboxes = relationship("Mailbox", back_populates="tenant", cascade="all, delete-orphan")
    agentTasks = relationship("AgentTask", back_populates="tenant", cascade="all, delete-orphan")
    csvImportJobs = relationship("CsvImportJob", back_populates="tenant", cascade="all, delete-orphan")
    researchJobs = relationship("ResearchJob", back_populates="tenant", cascade="all, delete-orphan")
    folders = relationship("Folder", back_populates="tenant", cascade="all, delete-orphan")
    knowledgeDocuments = relationship("KnowledgeDocument", back_populates="tenant", cascade="all, delete-orphan")
    promptTemplates = relationship("PromptTemplate", back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    password = Column(String, nullable=True)
    role = Column(SAEnum(UserRoleEnum, name="UserRole"), default=UserRoleEnum.MEMBER, nullable=False)
    avatarUrl = Column(String, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="users")
    campaigns = relationship("Campaign", back_populates="user")


# ============================================
# Prospects & Folders
# ============================================

class Folder(Base):
    __tablename__ = "folders"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    color = Column(String, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="folders")
    prospectLists = relationship("ProspectList", back_populates="folder")
    campaigns = relationship("Campaign", back_populates="folder")


class ProspectList(Base):
    __tablename__ = "prospect_lists"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    folderId = Column(String, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="prospectLists")
    folder = relationship("Folder", back_populates="prospectLists")
    entries = relationship("ProspectListEntry", back_populates="prospectList", cascade="all, delete-orphan")
    csvImportJobs = relationship("CsvImportJob", back_populates="list")
    researchJobs = relationship("ResearchJob", back_populates="list")


class Prospect(Base):
    __tablename__ = "prospects"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    firstName = Column(String, nullable=False)
    lastName = Column(String, nullable=False)
    email = Column(String, nullable=True, index=True)
    emailVerified = Column(Boolean, default=False, nullable=False)
    emailConfidence = Column(Integer, default=0, nullable=False)
    phone = Column(String, nullable=True)
    linkedinUrl = Column(String, nullable=True)
    companyName = Column(String, nullable=False)
    companyDomain = Column(String, nullable=True, index=True)
    jobTitle = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    location = Column(String, nullable=True)
    enrichmentData = Column(JSONB, nullable=True)
    source = Column(SAEnum(ProspectSourceEnum, name="ProspectSource"), default=ProspectSourceEnum.MANUAL, nullable=False)
    csvImportJobId = Column(String, ForeignKey("csv_import_jobs.id", ondelete="SET NULL"), nullable=True)
    researchJobId = Column(String, ForeignKey("research_jobs.id", ondelete="SET NULL"), nullable=True)
    callStatus = Column(SAEnum(CallStatusEnum, name="CallStatus"), default=CallStatusEnum.UNCALLED, nullable=False)
    callNotes = Column(Text, nullable=True)
    lastCalledAt = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    lists = relationship("ProspectListEntry", back_populates="prospect", cascade="all, delete-orphan")
    campaignProspects = relationship("CampaignProspect", back_populates="prospect", cascade="all, delete-orphan")
    csvImportJob = relationship("CsvImportJob", back_populates="prospects")
    researchJob = relationship("ResearchJob", back_populates="prospects")


class ProspectListEntry(Base):
    __tablename__ = "prospect_list_entries"

    id = Column(String, primary_key=True, default=generate_uuid)
    prospectId = Column(String, ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False)
    prospectListId = Column(String, ForeignKey("prospect_lists.id", ondelete="CASCADE"), nullable=False)

    prospect = relationship("Prospect", back_populates="lists")
    prospectList = relationship("ProspectList", back_populates="entries")

    __table_args__ = (
        UniqueConstraint("prospectId", "prospectListId", name="prospect_list_entries_prospectId_prospectListId_key"),
    )


# ============================================
# Campaigns & Sequences
# ============================================

class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    userId = Column(String, ForeignKey("users.id"), nullable=False)
    folderId = Column(String, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)
    status = Column(SAEnum(CampaignStatusEnum, name="CampaignStatus"), default=CampaignStatusEnum.DRAFT, nullable=False, index=True)
    aiConfig = Column(JSONB, default=dict, nullable=False)
    startDate = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="campaigns")
    user = relationship("User", back_populates="campaigns")
    folder = relationship("Folder", back_populates="campaigns")
    steps = relationship("SequenceStep", back_populates="campaign", cascade="all, delete-orphan", order_by="SequenceStep.stepOrder")
    prospects = relationship("CampaignProspect", back_populates="campaign", cascade="all, delete-orphan")
    knowledgeDocuments = relationship("KnowledgeDocument", back_populates="campaign", cascade="all, delete-orphan")


class SequenceStep(Base):
    __tablename__ = "sequence_steps"

    id = Column(String, primary_key=True, default=generate_uuid)
    campaignId = Column(String, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    stepOrder = Column(Integer, nullable=False)
    channel = Column(SAEnum(ChannelEnum, name="Channel"), default=ChannelEnum.EMAIL, nullable=False)
    templateType = Column(SAEnum(TemplateTypeEnum, name="TemplateType"), default=TemplateTypeEnum.AI_GENERATED, nullable=False)
    agentType = Column(SAEnum(AgentTypeEnum, name="AgentType"), default=AgentTypeEnum.FIRST_TOUCH, nullable=False)
    aiPrompt = Column(Text, nullable=True)
    subject = Column(String, nullable=True)
    manualContent = Column(Text, nullable=True)
    delayHours = Column(Integer, default=0, nullable=False)

    campaign = relationship("Campaign", back_populates="steps")
    generatedMessages = relationship("GeneratedMessage", back_populates="sequenceStep", cascade="all, delete-orphan")


class CampaignProspect(Base):
    __tablename__ = "campaign_prospects"

    id = Column(String, primary_key=True, default=generate_uuid)
    campaignId = Column(String, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    prospectId = Column(String, ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False)
    status = Column(SAEnum(CampaignProspectStatusEnum, name="CampaignProspectStatus"), default=CampaignProspectStatusEnum.PENDING, nullable=False, index=True)
    personalizedSubject = Column(String, nullable=True)
    personalizedBody = Column(String, nullable=True)
    currentStep = Column(Integer, default=0, nullable=False)
    lastContactedAt = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    campaign = relationship("Campaign", back_populates="prospects")
    prospect = relationship("Prospect", back_populates="campaignProspects")
    events = relationship("EmailEvent", back_populates="campaignProspect", cascade="all, delete-orphan")
    messages = relationship("GeneratedMessage", back_populates="campaignProspect", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("campaignId", "prospectId", name="campaign_prospects_campaignId_prospectId_key"),
    )


class EmailEvent(Base):
    __tablename__ = "email_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    campaignProspectId = Column(String, ForeignKey("campaign_prospects.id", ondelete="CASCADE"), nullable=False, index=True)
    eventType = Column(SAEnum(EmailEventTypeEnum, name="EmailEventType"), nullable=False, index=True)
    metadata_ = Column("metadata", JSONB, nullable=True)
    occurredAt = Column(DateTime, default=datetime.utcnow, nullable=False)

    campaignProspect = relationship("CampaignProspect", back_populates="events")


class Mailbox(Base):
    __tablename__ = "mailboxes"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    emailAddress = Column(String, nullable=False)
    smtpHost = Column(String, nullable=False)
    smtpPort = Column(Integer, default=587, nullable=False)
    smtpUser = Column(String, nullable=False)
    smtpPassEncrypted = Column(String, nullable=False)
    dailyLimit = Column(Integer, default=50, nullable=False)
    warmupLevel = Column(Integer, default=0, nullable=False)
    isActive = Column(Boolean, default=True, nullable=False)
    healthScore = Column(Float, default=100.0, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="mailboxes")


# ============================================
# AI Tasks & Research Jobs
# ============================================

class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    agentName = Column(String, nullable=False, index=True)
    status = Column(SAEnum(AgentTaskStatusEnum, name="AgentTaskStatus"), default=AgentTaskStatusEnum.QUEUED, nullable=False, index=True)
    input = Column(JSONB, nullable=False)
    output = Column(JSONB, nullable=True)
    error = Column(String, nullable=True)
    tokensUsed = Column(Integer, default=0, nullable=False)
    durationMs = Column(Integer, default=0, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    completedAt = Column(DateTime, nullable=True)

    tenant = relationship("Tenant", back_populates="agentTasks")


class ResearchJob(Base):
    __tablename__ = "research_jobs"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    targetCount = Column(Integer, default=100, nullable=False)
    foundCount = Column(Integer, default=0, nullable=False)
    processedCount = Column(Integer, default=0, nullable=False)
    status = Column(SAEnum(ResearchJobStatusEnum, name="ResearchJobStatus"), default=ResearchJobStatusEnum.PENDING, nullable=False, index=True)
    blacklistedDomains = Column(JSONB, default=list, nullable=False)
    options = Column(JSONB, default=dict, nullable=False)
    listId = Column(String, ForeignKey("prospect_lists.id", ondelete="SET NULL"), nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="researchJobs")
    list = relationship("ProspectList", back_populates="researchJobs")
    prospects = relationship("Prospect", back_populates="researchJob")


class CsvImportJob(Base):
    __tablename__ = "csv_import_jobs"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    jobType = Column(SAEnum(JobTypeEnum, name="JobType"), default=JobTypeEnum.ENRICHMENT, nullable=False)
    status = Column(SAEnum(ImportJobStatusEnum, name="ImportJobStatus"), default=ImportJobStatusEnum.PENDING, nullable=False, index=True)
    totalRows = Column(Integer, default=0, nullable=False)
    processedRows = Column(Integer, default=0, nullable=False)
    enrichedRows = Column(Integer, default=0, nullable=False)
    failedRows = Column(Integer, default=0, nullable=False)
    emailsFoundSearch = Column(Integer, default=0, nullable=False)
    emailsFoundAnymail = Column(Integer, default=0, nullable=False)
    emailsFoundDatabase = Column(Integer, default=0, nullable=False)
    emailsNotFound = Column(Integer, default=0, nullable=False)
    listId = Column(String, ForeignKey("prospect_lists.id", ondelete="SET NULL"), nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="csvImportJobs")
    list = relationship("ProspectList", back_populates="csvImportJobs")
    prospects = relationship("Prospect", back_populates="csvImportJob")


class GeneratedMessage(Base):
    __tablename__ = "generated_messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    campaignProspectId = Column(String, ForeignKey("campaign_prospects.id", ondelete="CASCADE"), nullable=False, index=True)
    sequenceStepId = Column(String, ForeignKey("sequence_steps.id", ondelete="CASCADE"), nullable=False, index=True)
    subject = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    status = Column(SAEnum(GeneratedMessageStatusEnum, name="GeneratedMessageStatus"), default=GeneratedMessageStatusEnum.DRAFT, nullable=False, index=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    campaignProspect = relationship("CampaignProspect", back_populates="messages")
    sequenceStep = relationship("SequenceStep", back_populates="generatedMessages")


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    campaignId = Column(String, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    fileUrl = Column(String, nullable=True)
    isActive = Column(Boolean, default=True, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="knowledgeDocuments")
    campaign = relationship("Campaign", back_populates="knowledgeDocuments")


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(String, primary_key=True, default=generate_uuid)
    tenantId = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    globalContext = Column(Text, nullable=True)
    visualAuditPrompt = Column(Text, nullable=True)
    campaignObjective = Column(Text, nullable=True)
    steps = Column(JSONB, default=list, nullable=True)
    subjectPrompt = Column(Text, nullable=True)
    firstTouchPrompt = Column(Text, nullable=True)
    followUpPrompt = Column(Text, nullable=True)
    closerPrompt = Column(Text, nullable=True)
    isDefault = Column(Boolean, default=False, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="promptTemplates")
