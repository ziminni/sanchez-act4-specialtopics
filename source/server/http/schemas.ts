import { z } from "zod";

export const id = z.coerce.number().int().positive();
export const amount = z.number().int().positive().max(999999999999);
export const reason = z.string().trim().min(5).max(1000);
export const text = z.string().trim().min(1).max(200);
