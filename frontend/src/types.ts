export interface Email {
  id: string;
  sender: string;
  sender_name: string;
  subject: string;
  body: string;
  timestamp: string;
}

export interface EmailClassification {
  intent: "royalty_payment" | "publishing_status" | "printing_issue" | "cover_design" | "distribution" | "isbn_metadata" | "general_inquiry" | "complaint" | "spam";
  urgency: number;
  key_details: string[];
  missing_information: string[];
  confidence: number;
  classification_explanation: string;
}

export interface RecommendedAction {
  action_type: "auto_reply" | "route_to_team" | "request_more_info" | "archive" | "escalate" | "issue_refund" | "modify_metadata";
  description: string;
  target_team: string | null;
}

export interface GuardrailResult {
  approval_required: boolean;
  missing_info_block: boolean;
  reasons: string[];
  risk_level: "low" | "medium" | "high";
}

export interface HumanDecision {
  decision: "approve" | "reject" | "correct";
  corrected_intent?: string;
  notes?: string;
}

export interface HumanCorrection {
  email_subject: string;
  email_body: string;
  original_intent: string;
  corrected_intent: string;
  notes: string;
  timestamp: string;
}

export interface ProcessingResponse {
  thread_id: string;
  state: {
    email: Email;
    supplementary_info?: string;
    corrections?: string;
    classification?: EmailClassification;
    recommended_action?: RecommendedAction;
    guardrail_result?: GuardrailResult;
    approval_required?: boolean;
    missing_info_block?: boolean;
    human_decision?: HumanDecision;
    retry_count?: number;
    correction_count?: number;
    processing_log?: string[];
    final_status?: "executed" | "rejected" | "manual_review" | "error" | "pending_approval" | "pending_info" | "processing";
  };
}
