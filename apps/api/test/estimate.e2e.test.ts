import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { prisma } from "@m/db";
import { seed } from "../../../packages/db/prisma/seed";

let app: INestApplication;
beforeAll(async () => {
  await seed();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe("POST /estimate (anonymous)", () => {
  it("returns lines and totals for a valid request", async () => {
    const res = await request(app.getHttpServer())
      .post("/estimate")
      .send({ city: "msk", format: "zags", tier: "mid", guests: 80 });
    expect(res.status).toBe(201);
    expect(res.body.lines.length).toBeGreaterThan(0);
    expect(BigInt(res.body.totalMid)).toBeGreaterThan(0n);
    // banquet is per_guest → scaled by 80
    const banquet = res.body.lines.find((l: any) => l.categorySlug === "banquet");
    expect(banquet.label).toMatch(/Ориентир/); // seed at launch
  });

  it("rejects invalid guests with 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/estimate")
      .send({ city: "msk", format: "zags", tier: "mid", guests: 0 });
    expect(res.status).toBe(400);
  });
});
