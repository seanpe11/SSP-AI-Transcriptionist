from openai import OpenAI

client = OpenAI()
audio_file = open(
    "~/Documents/projects/Transcriptions/121824 Oishi Audio/er121824.m4a", "rb"
)

transcription = client.audio.transcriptions.create(
    file=audio_file,
    model="whisper-1",
    response_format="verbose_json",
    timestamp_granularities=["segment"],
)

print(transcription.words)
