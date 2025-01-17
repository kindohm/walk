const { exec } = require("child_process");
const fs = require("fs");
const { add } = require("date-fns");

const CHUNK_DAY_SIZE = 12;
const exclude = [
  ".svg",
  ".png",
  ".gif",
  ".jpg",
  ".gitkeep",
  ".lock",
  "CHANGELOG.md",
  ".snap",
  ".cspell",
  ".spec.",
  ".cy.",
  ".txt",
];
const excludeAuthors = [
  "semantic-release-bot <semantic-release-bot@martynus.net>",
  "dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>",
  "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
];

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

    // const command = `git log --numstat 448a1bb4d5ec9fe872fdee03147c429c024a3f13`;
    const command = `git log --numstat --pretty --after=${startDateString} --before=${endDateString}`;
    exec(
      `cd ~/code/thrivent-web && ${command}`,
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

        const formatted = raw
          .map((commit, i) => {
            try {
              const lines = commit.split("\n");
              const isMerge = !!lines.find((l) => l.indexOf("Merge: ") === 0);

              const sha = lines[0].replace("commit ", "");
              const author = lines[isMerge ? 2 : 1].substring(8);
              if (excludeAuthors.includes(author)) {
                return null;
              }
              const dateString = lines[isMerge ? 3 : 2].substring(8);
              const date = new Date(dateString);

              const spaceIndex = lines.findIndex(
                (l, i) => i > (isMerge ? 5 : 4) && l === ""
              );

              const notesLines = lines
                .filter((l, i) => i >= (isMerge ? 5 : 4) && i < spaceIndex)
                .map((n) => n.substring(4));
              const fileLines = lines
                .filter((l, i) => i > spaceIndex)
                .filter((l) => l.trim().length > 0)
                .filter((l) => l.indexOf("=>") === -1);

              const notes = notesLines.join("\n");
              const files = fileLines
                .map((fl) => {
                  const [adds, rems, path] = fl.split("\t");
                  return {
                    add: parseFloat(adds),
                    rem: parseFloat(rems),
                    path,
                  };
                })
                .filter((f) => {
                  if (
                    !f.path ||
                    f.rem === null ||
                    f.rem === undefined ||
                    f.add === null ||
                    f.add === undefined
                  )
                    return false;
                  // const parts = f.path.split(".");

                  if (exclude.find((ext) => f.path.includes(ext))) return false;

                  // if (exclude.includes(parts[parts.length - 1])) return false;
                  return true;
                });

              const { adds, rems } = files.reduce(
                (acc, current) => {
                  return {
                    adds: acc.adds + current.add,
                    rems: acc.rems + current.rem,
                  };
                },
                { adds: 0, rems: 0 }
              );

              // process.exit();
              return {
                sha,
                author,
                files,
                date,
                fileCount: files.length ?? 0,
                adds,
                rems,
                notes,
                isMerge,
              };
            } catch (err) {
              console.error("error doing stuff", err.message);
              console.error("commit", commit);
              throw err;
            }
          })
          .filter((x) => x !== null);

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

  // let max = 10;
  // let cur = 0;

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
    // cur++;

    // if (cur >= max) {
    //   done = true;
    // }
  }

  commits = commits.sort((a, b) => {
    return a.date > b.date ? 1 : -1;
  });

  console.log("commits:", commits.length);

  const maxAdd = commits.reduce((acc, current) => {
    return acc < current.adds ? current.adds : acc;
  }, 0);
  const maxRem = commits.reduce((acc, current) => {
    return acc < current.rems ? current.rems : acc;
  }, 0);

  const uniqueFiles = commits.reduce((acc, current) => {
    const files = current.files.map((f) => f.path);
    const newUniqueFiles = [];

    files.forEach((file) => {
      if (!acc.includes(file)) {
        newUniqueFiles.push(file);
      }
    });

    return acc.concat(newUniqueFiles);
  }, []);

  const uniqueAuthors = commits.reduce((acc, current) => {
    if (!acc.includes(current.author)) {
      return acc.concat(current.author);
    }
    return acc;
  }, []);

  console.log("writing file...");
  fs.writeFileSync(
    `${__dirname}/out/out.json`,
    JSON.stringify(
      {
        maxAdd,
        maxRem,
        numCommits: commits.length,
        uniqueFiles: uniqueFiles.length,
        uniqueAuthors: uniqueAuthors.length,
        uniqueAuthorsArray: uniqueAuthors,
        commits,
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log("done");
};

main();
