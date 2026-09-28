import { Request, Response } from "express";
import { COMPANY_SIZES, INDUSTRIES, parseUpdateCompanyBody } from "../validation/team.validation";
import { getCompany, updateCompany as updateCompanyService } from "../services/company.service";

export async function getCompanyProfile(_req: Request, res: Response) {
  res.status(200).json({ ...(await getCompany()), options: { industries: INDUSTRIES, sizes: COMPANY_SIZES } });
}

export async function updateCompany(req: Request, res: Response) {
  res.status(200).json(await updateCompanyService(parseUpdateCompanyBody(req.body)));
}
