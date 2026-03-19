/**
 * API do ranking público (top 7 fake + usuários reais do mês).
 */

import { apiRequestWithAuth } from "./client";
import { getPlatformToken } from "./platformAuth";

export type PublicRankingItem = {
  position: number;
  name: string;
  avatar_url: string | null;
  total_profit: number;
  operations_count: number;
  is_fake: boolean;
};

export type PublicRankingResponse = {
  items: PublicRankingItem[];
  period_start: string;
  period_end: string;
};

export async function getPublicRanking(preset = "current_month"): Promise<PublicRankingResponse> {
  const token = getPlatformToken();
  if (!token) throw new Error("Não autenticado.");
  return apiRequestWithAuth<PublicRankingResponse>(
    `/api/platform/ranking?preset=${encodeURIComponent(preset)}`,
    token
  );
}
