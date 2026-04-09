"use client";

import { useState } from "react";

const AdminPage = () => {
  const [eventId, setEventId] = useState("0");
  const [message, setMessage] = useState("");

  async function confirmResolution(action: "confirm" | "override") {
    const payload = {
      confirmedBy: "0xAdminAddress",
      action,
      overrideReason: action === "override" ? "Manual override from dashboard" : null,
      outcomes: { 0: "YES" },
    };
    try {
      const res = await fetch(`http://localhost:8001/resolution/confirm/${eventId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("confirm failed");
      const json = await res.json();
      setMessage(`Confirmed with evidence hash: ${json.evidenceHash}`);
    } catch (err) {
      setMessage(`Action failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>
      <p className="text-base-content/70 mb-4">
        Use this page to confirm or override pending resolution packets before on-chain resolve.
      </p>
      <div className="card bg-base-200 p-4">
        <label className="label">Event ID</label>
        <input className="input input-bordered mb-4" value={eventId} onChange={e => setEventId(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => confirmResolution("confirm")}>
            Confirm All
          </button>
          <button className="btn btn-warning" onClick={() => confirmResolution("override")}>
            Override
          </button>
        </div>
      </div>
      {message && <p className="mt-4 text-sm">{message}</p>}
    </div>
  );
};

export default AdminPage;
