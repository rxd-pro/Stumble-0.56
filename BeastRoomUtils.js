const Console = require("./ConsoleUtils");
const { SendDiscordEmbed } = require("./DiscordUtils");

function handlePartyUpdate(req, res) {
  try {
    const {
      action,
      username,
      id,
      code,
      mode,
      map,
      emotes,
      qualified,
      creator,
      private: isPrivate,
      analyticsId,
      props,
    } = req.body || {};

    if (!action || !username || !id)
      return res.status(400).send("missing something");

    let msg = `${username} (${id}) ${
      action === "create"
        ? "created"
        : action === "start"
        ? "started"
        : action === "finish"
        ? "finished"
        : "joined"
    } a party`;

    const info = [];
    if (code) info.push(`Code: ${code}`);
    if (mode) info.push(`Mode: ${mode}`);
    if (map) info.push(`Map: ${map}`);
    if (qualified !== undefined) info.push(`MaxQualified: ${qualified}`);
    info.push(`IsPrivate: ${isPrivate}`);
    info.push(`IsCreator: ${creator}`);
    if (emotes) info.push(`Emotes: ${emotes}`);
    if (analyticsId) info.push(`AnalyticsId: ${analyticsId}`);

    if (props) {
      let formattedProps = "";

      if (typeof props === "string") {
        let clean = props
          .replace(/\(System\.[^)]+\)/g, "")
          .replace(/System\.[A-Za-z0-9_.]+/g, "")
          .replace(/[{}]/g, "")
          .replace(/\s+/g, " ")
          .trim();

        const pairs = clean.split(",").map((p) => p.trim());
        const cleaned = pairs
          .map((pair) => {
            const [key, value] = pair.split("=");
            if (!key || value === undefined) return null;
            return `${key.trim()} = ${value.trim()}`;
          })
          .filter(Boolean);

        formattedProps = cleaned
          .sort((a, b) => a.localeCompare(b))
          .join(", ");
      } else if (typeof props === "object") {
        formattedProps = Object.entries(props)
          .map(([k, v]) => {
            if (Array.isArray(v)) return `${k} = [${v.join(", ")}]`;
            if (typeof v === "object" && v !== null)
              return `${k} = ${JSON.stringify(v)}`;
            return `${k} = ${v}`;
          })
          .sort((a, b) => a.localeCompare(b))
          .join(", ");
      }

      if (formattedProps) info.push(`Props:\n  { ${formattedProps.replace(/, /g, ",\n    ")} }`);
    }

    msg += " | " + info.join(",\n  ");
    Console.rooms("ZoneRooms", msg);
    res.status(200).send("OK");
  } catch (err) {
    Console.error("ZoneRooms", "Error handling party update:", err);
    res.status(400).send("invalid json");
  }
}

module.exports = { handlePartyUpdate };
