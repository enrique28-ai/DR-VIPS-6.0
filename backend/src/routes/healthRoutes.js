import { Router } from "express";

import {
  getLiveness,
  getReadiness,
} from "../controllers/healthController.js";

const router = Router();

router.get("/live", getLiveness);
router.get("/ready", getReadiness);

export default router;
