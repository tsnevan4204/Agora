from __future__ import annotations

from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, model_validator


class Metric(str, Enum):
    eps = "eps"
    revenue = "revenue"
    net_income = "netIncome"


class Operator(str, Enum):
    gt = ">"
    gte = ">="
    lt = "<"
    lte = "<="
    between = "between"


class ResolutionSpec(BaseModel):
    ticker: str
    fiscalYear: int
    fiscalQuarter: int
    metric: Metric
    operator: Operator
    threshold: float | None = None
    thresholdLow: float | None = None
    thresholdHigh: float | None = None
    expectedEarningsTimeUtc: datetime

    @model_validator(mode="after")
    def validate_operator_thresholds(self) -> ResolutionSpec:
        if self.operator == Operator.between:
            if self.thresholdLow is None or self.thresholdHigh is None:
                raise ValueError("operator 'between' requires thresholdLow and thresholdHigh")
            if self.thresholdLow > self.thresholdHigh:
                raise ValueError("thresholdLow must be <= thresholdHigh")
            if self.threshold is not None:
                raise ValueError("operator 'between' must not set threshold")
        else:
            if self.threshold is None:
                raise ValueError(f"operator '{self.operator.value}' requires threshold")
            if self.thresholdLow is not None or self.thresholdHigh is not None:
                raise ValueError("thresholdLow/thresholdHigh are only valid for operator 'between'")
        return self


class EventProposal(BaseModel):
    proposalId: str
    createdAtUtc: datetime = Field(default_factory=datetime.utcnow)
    proposerAddress: str
    title: str
    category: str
    ticker: str
    metric: Metric
    fiscalYear: int
    fiscalQuarter: int
    suggestedRanges: list[str] = Field(default_factory=list)
    status: str = "pending"
    adminNotes: str | None = None


class ProposalMarketSpec(BaseModel):
    question: str
    resolutionSpecHash: str  # 0x-prefixed 66-char hex from client
    resolutionSpecURI: str


class ProposalApproveRequest(BaseModel):
    """Admin approves proposal and creates event + markets on-chain."""
    confirmedBy: str
    closeTimeUnix: int  # unix seconds; must be > block time on chain
    markets: list[ProposalMarketSpec] = Field(min_length=1)


class ProposalRejectRequest(BaseModel):
    confirmedBy: str
    reason: str = Field(min_length=1)


class PendingResolution(BaseModel):
    eventId: int
    marketIds: list[int]
    ticker: str
    scrapedAtUtc: datetime
    rawHtmlHash: str
    parsedJsonHash: str
    extractedValues: dict
    proposedOutcomes: dict[int, str]
    parserVersion: str
    expectedEarningsTimeUtc: datetime


class AdminResolutionAction(BaseModel):
    confirmedBy: str
    confirmedAtUtc: datetime = Field(default_factory=datetime.utcnow)
    action: str  # confirm | override
    overrideReason: str | None = None
    outcomes: dict[str, str]  # JSON keys are strings; "0" -> "YES"


class RelayForwardRequest(BaseModel):
    from_address: str = Field(alias="from")
    to: str
    value: int = 0
    gas: int
    deadline: int
    data: str
    signature: str


class RelayExecuteResponse(BaseModel):
    ok: bool
    txHash: str | None = None
    reason: str | None = None
