import http from "k6/http";
import { check, sleep } from "k6";

/**
 * §13.1 "Load test (k6) ... browse + search + add to cart + checkout mix;
 * target 500 concurrent virtual users on VPS mode without errors (free
 * tier is not expected to meet this; document the limits)".
 *
 * Not run in this environment — no k6 binary and no live deployment to
 * point it at (docs/PROGRESS.md, every milestone's "Not verified"
 * section). Run it against a real deployment with:
 *
 *   k6 run -e BASE_URL=https://api.example.com \
 *          -e CATEGORY_SLUG=panjabi -e PRODUCT_SLUG=cotton-panjabi-navy \
 *          -e VARIANT_ID=<a real variant id> \
 *          infra/loadtest/browse-cart-checkout.js
 *
 * `CATEGORY_SLUG`/`PRODUCT_SLUG`/`VARIANT_ID` default to this project's
 * demo seed (`pnpm db:seed:demo`, see packages/db/src/seed-data) — override
 * them for any other catalog. COD-only on purpose: a real payment gateway
 * sandbox isn't something a load test should be hammering.
 */
const BASE_URL = __ENV.BASE_URL || "http://localhost:4000/api/v1";
const CATEGORY_SLUG = __ENV.CATEGORY_SLUG || "panjabi";
const PRODUCT_SLUG = __ENV.PRODUCT_SLUG || "cotton-panjabi-navy";
const VARIANT_ID = __ENV.VARIANT_ID || "";

export const options = {
  scenarios: {
    browse_search_cart_checkout: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 100 },
        { duration: "3m", target: 500 },
        { duration: "2m", target: 500 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:catalog_read}": ["p(95)<300"], // §13.1 "API p95 (catalog reads) < 300ms (warm)"
    "http_req_duration{name:place_order}": ["p(95)<1500"], // §13.1 "Place order p95 < 1.5s"
  },
};

function browse() {
  http.get(`${BASE_URL}/store/catalog/categories/${CATEGORY_SLUG}`, { tags: { name: "catalog_read" } });
  const listing = http.get(`${BASE_URL}/store/catalog/listing?categoryId=${CATEGORY_SLUG}&page=1`, { tags: { name: "catalog_read" } });
  check(listing, { "listing 200": (r) => r.status === 200 });
  sleep(1);

  http.get(`${BASE_URL}/store/catalog/products/${PRODUCT_SLUG}`, { tags: { name: "catalog_read" } });
  sleep(1);
}

function search() {
  const term = ["panjabi", "shirt", "saree", "kurta"][Math.floor(Math.random() * 4)];
  const res = http.get(`${BASE_URL}/store/search?q=${term}`, { tags: { name: "catalog_read" } });
  check(res, { "search 200": (r) => r.status === 200 });
  sleep(1);
}

function addToCartAndCheckout() {
  if (!VARIANT_ID) return; // no seeded variant id supplied — browse/search-only run

  const addItem = http.post(
    `${BASE_URL}/store/cart/items`,
    JSON.stringify({ variantId: VARIANT_ID, quantity: 1 }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "cart_write" } },
  );
  check(addItem, { "add to cart 200": (r) => r.status === 200 });
  sleep(1);

  const placeOrder = http.post(
    `${BASE_URL}/store/checkout/place-order`,
    JSON.stringify({
      paymentMethod: "cod",
      contactPhone: `017${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      contactName: "Load Test",
      shippingAddress: { line1: "123 Test Road", districtId: "dhaka", areaId: "dhaka-city", isDhakaCity: true },
    }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "place_order" } },
  );
  check(placeOrder, { "place order 2xx or expected 4xx": (r) => r.status < 500 });
}

export default function () {
  browse();
  if (Math.random() < 0.4) search();
  if (Math.random() < 0.2) addToCartAndCheckout();
}
