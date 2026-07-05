import {
  actionCenterResponseSchema,
  dashboardSummaryResponseSchema,
  trainerUtilizationResponseSchema,
  type ActionCenterResponse,
  type DashboardSummaryResponse,
  type TrainerUtilizationResponse,
} from '../../shared/apiContracts';
import { typedApiRequest } from './typedApi';

export const dashboardApi = {
  getSummary: (): Promise<DashboardSummaryResponse> =>
    typedApiRequest('/api/dashboard/summary', dashboardSummaryResponseSchema),

  getTrainerUtilization: (): Promise<TrainerUtilizationResponse> =>
    typedApiRequest('/api/dashboard/trainer-utilization', trainerUtilizationResponseSchema),

  getActionCenter: (): Promise<ActionCenterResponse> =>
    typedApiRequest('/api/dashboard/action-center', actionCenterResponseSchema),
};
