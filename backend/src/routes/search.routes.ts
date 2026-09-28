import { Router } from "express";
import * as searchController from "../controllers/search.controller";

export const searchRouter = Router();

searchRouter.get("/", searchController.search);
