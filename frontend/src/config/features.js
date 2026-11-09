export const notificationsEnabledForEnvironment = (isProduction) =>
  !isProduction;

export const NOTIFICATIONS_ENABLED = notificationsEnabledForEnvironment(
  import.meta.env.PROD,
);
