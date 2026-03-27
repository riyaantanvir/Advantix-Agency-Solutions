import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import contactsRouter from "./contacts.js";
import portfolioRouter from "./portfolio.js";
import teamRouter from "./team.js";
import leadsRouter from "./leads.js";
import statsRouter from "./stats.js";
import chatRouter from "./chat.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(contactsRouter);
router.use(portfolioRouter);
router.use(teamRouter);
router.use(leadsRouter);
router.use(statsRouter);
router.use(chatRouter);

export default router;
