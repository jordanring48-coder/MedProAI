import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export const AVATAR_GRADIENTS: Record<string, { from: string; to: string; glow: string }> = {
  purple:  { from: "#D24DFF", to: "#8A1AD1", glow: "rgba(210,77,255,0.35)" },
  pink:    { from: "#FF6EC7", to: "#B0158E", glow: "rgba(255,110,199,0.35)" },
  violet:  { from: "#8E7CFF", to: "#4B32C9", glow: "rgba(142,124,255,0.35)" },
  coral:   { from: "#FF8A5C", to: "#C43E1F", glow: "rgba(255,138,92,0.35)" },
  teal:    { from: "#4DE3D1", to: "#0F8F80", glow: "rgba(77,227,209,0.35)" },
  amber:   { from: "#FFD25C", to: "#C98A0A", glow: "rgba(255,210,92,0.35)" },
};

export default function UserAvatar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const initial = (user?.name || user?.email || "U").charAt(0).toUpperCase();
  const colorName = user?.avatarColor || "purple";
  const grad = AVATAR_GRADIENTS[colorName] || AVATAR_GRADIENTS.purple;

  return (
    <button
      onClick={() => navigate("/profile")}
      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
      style={{
        background: `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
        boxShadow: `0 0 10px 2px ${grad.glow}`,
        color: "#FFFFFF",
      }}
    >
      {initial}
    </button>
  );
}
