"use client";

import { useState } from "react";

const ProposePage = () => {
  const [status, setStatus] = useState<string>("");

  async function submitProposal(formData: FormData) {
    const payload = {
      proposalId: crypto.randomUUID(),
      proposerAddress: String(formData.get("proposerAddress") || ""),
      title: String(formData.get("title") || ""),
      category: "earnings",
      ticker: String(formData.get("ticker") || "").toUpperCase(),
      metric: String(formData.get("metric") || "eps"),
      fiscalYear: Number(formData.get("fiscalYear") || new Date().getUTCFullYear()),
      fiscalQuarter: Number(formData.get("fiscalQuarter") || 1),
      suggestedRanges: String(formData.get("suggestedRanges") || "")
        .split(",")
        .map(v => v.trim())
        .filter(Boolean),
    };

    try {
      const res = await fetch("http://localhost:8001/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to submit proposal");
      setStatus("Proposal submitted.");
    } catch (err) {
      setStatus(`Submission failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Propose Event</h1>
      <form
        className="grid gap-3"
        onSubmit={async e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          await submitProposal(fd);
        }}
      >
        <input
          className="input input-bordered w-full"
          name="proposerAddress"
          placeholder="Proposer wallet address"
          required
        />
        <input
          className="input input-bordered w-full"
          name="title"
          placeholder="Event title (e.g. Apple Q2 Earnings)"
          required
        />
        <input className="input input-bordered w-full" name="ticker" placeholder="Ticker (e.g. AAPL)" required />
        <select className="select select-bordered w-full" name="metric" defaultValue="eps">
          <option value="eps">EPS</option>
          <option value="revenue">Revenue</option>
          <option value="netIncome">Net Income</option>
        </select>
        <input
          className="input input-bordered w-full"
          name="fiscalYear"
          type="number"
          defaultValue={new Date().getUTCFullYear()}
        />
        <input
          className="input input-bordered w-full"
          name="fiscalQuarter"
          type="number"
          min={1}
          max={4}
          defaultValue={1}
        />
        <input
          className="input input-bordered w-full"
          name="suggestedRanges"
          placeholder="Suggested ranges/thresholds (comma separated)"
        />
        <button className="btn btn-primary" type="submit">
          Submit Proposal
        </button>
      </form>
      {status && <p className="mt-4 text-sm">{status}</p>}
    </div>
  );
};

export default ProposePage;
