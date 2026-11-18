import { parseBirthDate } from "@/lib/validation";
import { sameOriginRequest } from "@/lib/sameOrigin";
import { normalizeAvatarDataUrl } from "@/lib/avatarUpload";
import { getClientCookie } from "@/lib/clientSession";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ProfilePayload = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthDate?: string;
  avatarDataUrl?: string;
  removeAvatar?: boolean;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function error(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return error("Недопустимый запрос", 403);
  let payload: ProfilePayload;

  try {
    payload = await request.json();
  } catch {
    return error("Не удалось прочитать данные профиля.");
  }

  const clientToken = await getClientCookie();
  if (!clientToken) return error("Войдите в личный кабинет", 401);
  const firstName = clean(payload.firstName);
  const lastName = clean(payload.lastName);
  const phone = formatPhone(clean(payload.phone));
  const birthDateText = clean(payload.birthDate);

  if (!clientToken || !firstName || !lastName || !phone || !birthDateText) return error("Заполните имя, фамилию, телефон и дату рождения.");

  const client = await prisma.client.findUnique({ where: { publicToken: clientToken } });
  if (!client) return error("Клиент не найден.", 404);
  if (client.status !== "APPROVED") return error("Профиль недоступен.", 403);

  const duplicate = await prisma.client.findUnique({ where: { phone } });
  if (duplicate && duplicate.id !== client.id) return error("Этот телефон уже есть в другой карточке.");

  let avatarUrl = client.avatarUrl;
  if (payload.removeAvatar) {
    avatarUrl = "";
  } else {
    const avatar = normalizeAvatarDataUrl(payload.avatarDataUrl || "");
    if (avatar) {
      if (!avatar.ok) return error(avatar.error === "size" ? "Фото слишком большое. Выберите фото поменьше." : "Фото не сохранилось. Нужен JPG, PNG или WEBP.");
      avatarUrl = avatar.value;
    }
  }

  let birthDate: Date;
  try { birthDate = parseBirthDate(birthDateText); } catch { return error("Проверьте дату рождения"); }
  if (phone.replace(/\D/g, "").length < 10) return error("Проверьте телефон");
  await prisma.client.update({
    where: { id: client.id },
    data: {
      firstName,
      lastName,
      phone,
      birthDate,
      avatarUrl
    }
  });


  return NextResponse.json({ ok: true, redirectTo: "/my?profileSaved=1#profile" });
}
