import { seedDemoData } from "./seed.js";

const result = seedDemoData();
console.log(
  JSON.stringify(
    {
      status: "OK",
      ...result,
    },
    null,
    2
  )
);
