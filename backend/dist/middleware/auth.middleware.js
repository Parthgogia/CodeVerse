import jwt from "jsonwebtoken";
export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader; // also accept bare token (non-standard but forgiving)
    if (!token) {
        res.status(401).json({ message: "No token provided" });
        return;
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    }
    catch (err) {
        const message = err?.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
        res.status(401).json({ message });
    }
};
//# sourceMappingURL=auth.middleware.js.map