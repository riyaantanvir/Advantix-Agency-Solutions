import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as { adminId?: number; username?: string; isSuperAdmin?: boolean };
  if (!session.adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as { adminId?: number; isSuperAdmin?: boolean };
  if (!session.adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!session.isSuperAdmin) {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
}
