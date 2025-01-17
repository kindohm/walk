const fs = require("fs");

const raw = fs.readFileSync("./out/out.json", "utf-8");
const { commits } = JSON.parse(raw);

const stats = {};

for (let i = 0; i < commits.length; i++) {
  const { files } = commits[i];

  for (let x = 0; x < files.length; x++) {
    const { path, add, rem } = files[x];

    if (stats[path]) {
      stats[path].score += add + rem;
    } else {
      stats[path] = { score: add + rem };
    }
  }
}

const keys = Object.keys(stats);
const sorted = keys
  .map((key) => {
    return { ...stats[key], path: key };
  })
  .sort((a, b) => {
    return a.score > b.score ? -1 : 1;
  });

const top = sorted.slice(0, 15);
console.log("top", top);

console.log("done");

// 20,000 ???
