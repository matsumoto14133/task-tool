type PushLineMessageInput = {
  channelAccessToken: string;
  lineUserId: string;
  text: string;
};

export async function pushLineMessage(input: PushLineMessageInput) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.channelAccessToken}`,
    },
    body: JSON.stringify({
      to: input.lineUserId,
      messages: [
        {
          type: "text",
          text: input.text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE push failed: ${response.status} ${errorText}`);
  }

  return true;
}