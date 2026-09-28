import { Router } from "express";
import * as companyController from "../controllers/company.controller";
import { requirePermission } from "../middleware/currentUser";

export const companyRouter = Router();
companyRouter.get("/", companyController.getCompanyProfile);
companyRouter.put("/", requirePermission("company:edit"), companyController.updateCompany);
