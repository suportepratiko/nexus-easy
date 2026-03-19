import { apiRequestWithAuth } from "./client";
import { getPlatformToken } from "./platformAuth";

export type PlanPeriodType = "monthly" | "quarterly" | "semiannual" | "annual";

export type PlanPeriod = {
  id: string;
  period_type: PlanPeriodType;
  price: number;
  is_active: boolean;
  checkout_url: string | null;
};

export type Plan = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  periods: PlanPeriod[];
  users_count: number;
};

export type PlanPeriodInput = {
  period_type: PlanPeriodType;
  price: number;
  is_active: boolean;
  checkout_url?: string | null;
};

export type CreatePlanPayload = {
  name: string;
  description?: string | null;
  periods: PlanPeriodInput[];
};

export type UpdatePlanPayload = Partial<CreatePlanPayload> & {
  is_active?: boolean;
};

function withToken() {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return token;
}

export async function getPlans(): Promise<Plan[]> {
  const token = withToken();
  return apiRequestWithAuth<Plan[]>("/api/platform/admin/plans", token);
}

export async function createPlan(payload: CreatePlanPayload): Promise<Plan> {
  const token = withToken();
  return apiRequestWithAuth<Plan>("/api/platform/admin/plans", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePlan(id: string, payload: UpdatePlanPayload): Promise<Plan> {
  const token = withToken();
  return apiRequestWithAuth<Plan>(`/api/platform/admin/plans/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deletePlan(id: string): Promise<void> {
  const token = withToken();
  await apiRequestWithAuth<unknown>(`/api/platform/admin/plans/${id}`, token, {
    method: "DELETE",
  });
}

