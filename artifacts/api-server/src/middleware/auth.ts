import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as { adminId?: number; username?: string };
  if (!session.adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
