import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function UserAvatar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const initial = (user?.name || user?.email || "U").charAt(0).toUpperCase();
  const color = user?.avatarColor || "#BC25F9";

  return (
    <button
      onClick={() => navigate("/profile")}
      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
      style={{ backgroundColor: color, color: "#0A0A0B" }}
    >
      {initial}
    </button>
  );
}
