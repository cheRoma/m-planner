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

describe("GET /public/showcase", () => {
  it("returns seed aggregates publicly (no auth), with Cache-Control", async () => {
    const res = await request(app.getHttpServer()).get("/public/showcase?city=msk&tier=mid&format=zags");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.headers["cache-control"]).toContain("s-maxage");
  });
});
