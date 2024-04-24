const { exec } = require("child_process");
const fs = require("fs");
const { add } = require("date-fns");

const getCommits = ({ previousCommits, startDate, endDate }) => {
  return new Promise((res, rej) => {
    const startDateString = startDate.toISOString();
    const endDateString = endDate.toISOString();

    exec(
      `cd ~/code/thrivent-web && git log --numstat --pretty --after=${startDateString} --before=${endDateString}`,
      { maxBuffer: 1024 * 10000 },
      async (error, stdout, stderr) => {
        if (error) {
          console.error(`error: ${error.message}`);
          return;
        }

        if (stderr) {
          console.error(`stderr: ${stderr}`);
          return;
        }

        const raw = stdout.split("commit ").filter((c) => c.trim().length > 0);
        if (raw.length === 0) {
          res(previousCommits);
        }

        const formatted = raw.map((commit) => {
          const lines = commit.split("\n");
          const sha = lines[0];
          const author = lines[1].substring(8);
          const dateString = lines[2].substring(8);
          const date = new Date(dateString);

          const spaceIndex = lines.findIndex((l, i) => i > 4 && l === "");

          const notesLines = lines
            .filter((l, i) => i >= 4 && i < spaceIndex)
            .map((n) => n.substring(4));
          const fileLines = lines
            .filter((l, i) => i > spaceIndex)
            .filter((l) => l.trim().length > 0);

          const notes = notesLines.join("\n");
          const files = fileLines.map((fl) => {
            const [adds, rems, path] = fl.split("\t");
            return {
              additions: parseFloat(adds),
              removals: parseFloat(rems),
              path,
            };
          });

          return { sha, author, notes, files, dateString, date };
        });

        res(formatted);
      }
    );
  });
};

const main = async () => {
  let endDate = new Date();
  let startDate = add(endDate, { days: -7 });
  let done = false;
  let commits = [];

  while (!done) {
    const nextCommits = await getCommits({
      previousCommits: [],
      startDate,
      endDate,
    });
    commits = commits.concat(nextCommits);
    if (nextCommits.length === 0) {
      done = true;
    }
    endDate = add(endDate, { days: -7 });
    startDate = add(startDate, { days: -7 });
  }

  console.log("commits:", commits.length);

  fs.writeFileSync(
    `${__dirname}/out/out.json`,
    JSON.stringify(commits, null, 2),
    "utf-8"
  );

  console.log("done");
};

main();
