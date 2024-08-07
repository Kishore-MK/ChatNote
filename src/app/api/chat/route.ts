import { notesIndex } from "@/lib/db/pinecone";
import prisma from "@/lib/db/prisma";
import notemodel from "@/lib/notemodel";
import openai, { getEmbedding } from "@/lib/openai";
import {OpenAIStream, StreamingTextResponse} from "ai";
import { ChatCompletionMessage } from "openai/resources/index.mjs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages: ChatCompletionMessage[] = body.messages;

    const messagesTruncated = messages.slice(-6);

    const embedding = await getEmbedding(
      messagesTruncated.map((message) => message.content).join("\n")
    );

    const vectorQueryResponse = await notesIndex.query({
      vector: embedding,
      topK: 10,
    });

    const relevantNotes = await prisma.note.findMany({
      where: {
        id: { in: vectorQueryResponse.matches.map((match) => match.id) },
      },include: {links: true}
    });

    console.log("chat",relevantNotes)

    const systemMessage: ChatCompletionMessage={
        role:"assistant",
        content : "You are an intelligent note-taking app. You answer the user's questions based on their notes."+
        "The relevant notes for this query are: \n"+
        relevantNotes.map((note:notemodel)=>`Title: ${note.title}\n\nContent:\n${note.content}\n\n${note.linkdata}\n\n${note.links.map((link)=>`link: ${link.link}`).join("\n")}`).join("\n")
    };

    const response = await openai.chat.completions.create({
        model:"gpt-3.5-turbo",
        stream: true,
        messages: [systemMessage,...messagesTruncated]
    })

    const stream = OpenAIStream(response);
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Internal server srror" }, { status: 500 });
  }
}
