export interface PayKitPlugin {
  id: string;
  /**
   * Better-call endpoints to merge into the PayKit router.
   * Paths are relative to the API base path (e.g. "/dash/stats" → "/paykit/api/dash/stats").
   */
  endpoints?: Record<string, unknown>;
}
