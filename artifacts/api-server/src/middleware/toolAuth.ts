import type { Request, Response, NextFunction } from "express";

const ADMIN_TOOL_USER_ID = 1;
const ADMIN_TOOL_USER_NAME = "Admin";
const ADMIN_TOOL_USER_EMAIL = "admin@advantix.digital";

export { ADMIN_TOOL_USER_ID, ADMIN_TOOL_USER_NAME, ADMIN_TOOL_USER_EMAIL };

export function requireToolUser(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as { toolUserId?: number; adminId?: number; username?: string };
  if (session.toolUserId) {
    next();
    return;
  }
  if (session.adminId) {
    req.session.toolUserId = ADMIN_TOOL_USER_ID;
    req.session.toolUserName = ADMIN_TOOL_USER_NAME;
    req.session.toolUserEmail = ADMIN_TOOL_USER_EMAIL;
    next();
    return;
  }
  res.status(401).json({ error: "Not authenticated" });
}
