/* global Plotly */
import React from "react";
import { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { marked } from "marked";
import "./index.css";
import { loadingCode } from "./other.js";

const CONFIG = {
  threadId: "6",
  ownerId: "e1e6b21c463b4a1f9b5ac4c0255f9e27",
  apiEndpoint: "http://localhost:8000/api/chat",
};

async function callApi(message) {
  const response = await fetch(CONFIG.apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_message: message,
      thread_id: CONFIG.threadId,
      owner_id: CONFIG.ownerId,
    }),
  });

  return response;
}

function decodeBdata(field) {
  if (field && typeof field === "object" && field.bdata) {
    const binary = atob(field.bdata);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return Array.from(
      field.dtype === "f4"
        ? new Float32Array(bytes.buffer)
        : new Float64Array(bytes.buffer),
    );
  }
  return field;
}

function PlotlyChart({ figData }) {
  const plotRef = useRef(null);
  useEffect(() => {
    if (plotRef.current && figData) {
      const decodedData = figData.data.map((trace) => ({
        ...trace,
        x: decodeBdata(trace.x),
        y: decodeBdata(trace.y),
      }));

      const layout = {
        ...figData.layout,
        autosize: true,
        width: plotRef.current.offsetWidth,
        height: plotRef.current.offsetHeight * 0.9,
        paper_bgcolor: "#020b18", // พื้นหลังกราฟ (เหมือน body)
        plot_bgcolor: "#041120", // พื้นหลัง plot area (เหมือน chat-messages)
        font: { color: "#8ab4c9" }, // สีตัวอักษร
      };

      Plotly.newPlot(plotRef.current, decodedData, layout, {
        responsive: true,
      });
    }
  }, [figData]);

  return (
    <div
      className="plotly-graph"
      ref={plotRef}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function Chat() {
  const [conversations, setConversations] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [graphFinish, setGraphFinish] = useState(null);

  const chatEndRef = useRef(null);
  // ใช้ ref เก็บ loadingPlot เพื่อให้อ่านค่าล่าสุดได้เสมอใน async loop
  const loadingPlotRef = useRef(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations]);

  function handleChatUpdate(newMessage) {
    setConversations((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "ai") {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "ai",
          content: newMessage,
        };
        return updated;
      }
      return [...prev, { role: "ai", content: newMessage }];
    });
  }

  // ใช้บน onSubmit ของ <form> เพื่อจัดการการส่งข้อความ
  const handleSubmit = async (e) => {
    e.preventDefault(); // ป้องกันการรีเฟรชหน้าเมื่อส่งฟอร์ม
    if (!input.trim()) return; // ไม่ส่งข้อความว่าง

    const userMessage = input.trim();
    setInput("");
    setConversations((prev) => [
      ...prev,
      { role: "user", content: userMessage },
    ]);
    setIsLoading(true);

    const response = await callApi(userMessage);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("||?||");
      buffer = lines.pop() || ""; // เก็บส่วนที่ยังไม่สมบูรณ์ไว้ใน buffer
      for (const line of lines) {
        if (!line.startsWith("[CODE]") && !line.startsWith("[DONE]")) {
          handleChatUpdate(line);
        }
        if (line.startsWith("[CODE]")) {
          const graphData = line.slice(6).trim();
          handleChatUpdate(graphData);
          loadingPlotRef.current = true;
        }
        if (line.startsWith("[DONE]") && loadingPlotRef.current) {
          console.log("raw [DONE] line:", JSON.stringify(line));
          const graphJson = line.slice(6).trim();
          loadingPlotRef.current = false;
          try {
            const graphObj = JSON.parse(graphJson);
            setGraphFinish(graphObj);
          } catch (err) {
            console.error("Error parsing graph JSON:", err);
          }
        }
      }
    }
    console.log("Stream finished");
    setIsLoading(false);
  };

  return (
    <div className="chat-container">
      <div className="chat-box">
        <div className="chat-header">SUPER AI DB^2</div>
        <div className="chat-messages">
          <div className="message llm-message">
            <div className="message-content">
              <h2>
                👋 สวัสดีครับ! ผม "น้องสุดยอด Data Analysis" ยินดีให้บริการครับ!
              </h2>
              น้องสุดยอดพร้อมเป็นผู้ช่วยวิเคราะห์ข้อมูลให้ใช้งานได้จริงด้วยการสร้าง
              กราฟ และ รายงานExcel พร้อมบทวิเคราะห์ข้อมูลแบบมืออาชีพครับครับ💡
              <h3>อยากให้น้องสุดยอดช่วยอะไรครับ?</h3>
              <h3>1️⃣ ส่งไฟล์ Excel ยอดขายรวมรายเดือน</h3>- สร้างไฟล์ Excel
              ยอดขายรวม รายเดือนในแต่ละวัน
              <h3>2️⃣ วิเคราะห์หาเมนูที่ต้นทุนแพงขึ้นเกิน Foodcost ที่กำหนด</h3>-
              ค้นหาเมนูที่มีต้นทุนเพิ่มขึ้นสูงกว่า Food Cost ที่กำหนด
              บอกผมได้เลยว่าต้องการวิเคราะห์ข้อมูลเรื่องอะไรครับ😊
            </div>
          </div>
          {conversations.map((conv, index) => (
            <div
              key={index}
              className={`message ${conv.role === "user" ? "user-message" : "llm-message"}`}
            >
              <div
                className="message-content"
                dangerouslySetInnerHTML={{
                  __html: marked.parse(conv.content || ""),
                }}
              />
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-input-form">
          <form id="chat-form" onSubmit={handleSubmit}>
            <input
              id="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="น้องสุดยอดพร้อมตอบ ถามมาได้เลยครับ..."
              disabled={isLoading}
              autoComplete="off"
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? "กำลังตอบ" : "ส่ง"}
            </button>
          </form>
        </div>
      </div>
      <div
        id="graph-container"
        className="graph-container"
        style={{
          display:
            graphFinish !== null || loadingPlotRef.current ? "block" : "none",
        }}
      >
        {loadingPlotRef.current ? (
          <div
            className="loading-graph"
            dangerouslySetInnerHTML={{ __html: loadingCode }}
          />
        ) : null}
        {graphFinish !== null && !loadingPlotRef.current ? (
          <PlotlyChart figData={graphFinish} />
        ) : null}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Chat />
  </React.StrictMode>,
);
