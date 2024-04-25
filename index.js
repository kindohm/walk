const { exec } = require("child_process");
const fs = require("fs");
const { add } = require("date-fns");

const CHUNK_DAY_SIZE = 10;

const getCommitsFromOutput = (output) => {
  const splits = output.split("\ncommit ");

  const filtered = splits.filter((c) => c.trim().length > 0);
  return filtered;
};

const getCommits = ({ previousCommits, startDate, endDate }) => {
  return new Promise((res, rej) => {
    const startDateString = startDate.toISOString();
    const endDateString = endDate.toISOString();

    console.log(startDateString);

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

        const raw = getCommitsFromOutput(stdout); // stdout.split("commit ").filter((c) => c.trim().length > 0);
        if (raw.length === 0) {
          res(previousCommits);
        }

        const formatted = raw.map((commit) => {
          try {
            const lines = commit.split("\n");

            const sha = lines[0].replace("commit ", "").substring(0, 8);
            const author = lines[1].substring(8);
            const dateString = lines[2].substring(8);
            const date = new Date(dateString);

            const spaceIndex = lines.findIndex((l, i) => i > 4 && l === "");

            const notesLines = lines
              .filter((l, i) => i >= 4 && i < spaceIndex)
              .map((n) => n.substring(4));
            const fileLines = lines
              .filter((l, i) => i > spaceIndex)
              .filter((l) => l.trim().length > 0)
              .filter((l) => l.indexOf("=>") === -1);

            const notes = notesLines.join("\n");
            const files = fileLines.map((fl) => {
              const [adds, rems, path] = fl.split("\t");
              return {
                add: parseFloat(adds),
                rem: parseFloat(rems),
                path,
              };
            });

            return { sha, author, notes, files, date };
          } catch (err) {
            console.error("error doing stuff", err.message);
            console.error("commit", commit);
            throw err;
          }
        });

        res(formatted);
      }
    );
  });
};

const main = async () => {
  let endDate = new Date();
  let startDate = add(endDate, { days: -CHUNK_DAY_SIZE });
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
    endDate = add(endDate, { days: -CHUNK_DAY_SIZE });
    startDate = add(startDate, { days: -CHUNK_DAY_SIZE });
  }

  commits = commits.sort((a, b) => {
    return a.date > b.date ? -1 : 1;
  });

  console.log("commits:", commits.length);

  console.log("writing file...");
  fs.writeFileSync(
    `${__dirname}/out/out.json`,
    JSON.stringify(commits, null, 2),
    "utf-8"
  );

  console.log("done");
};

main();
