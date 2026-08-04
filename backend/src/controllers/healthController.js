import mongoose from "mongoose";

export const getLiveness = (_req, res) => {
  return res.status(200).json({ status: "ok" });
};

export const createReadinessHandler = ({
  getReadyState = () => mongoose.connection.readyState,
} = {}) => {
  return (_req, res) => {
    let ready = false;

    try {
      ready = getReadyState() === 1;
    } catch {
      ready = false;
    }

    return res
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "not_ready" });
  };
};

export const getReadiness = createReadinessHandler();
