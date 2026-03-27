import type { Request, Response, NextFunction } from "express";

export function requireToolUser(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as { toolUserId?: number };
  if (!session.toolUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}
