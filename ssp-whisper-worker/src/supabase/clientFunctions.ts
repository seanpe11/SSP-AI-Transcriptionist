import { SupabaseClient } from "@supabase/supabase-js";

const TABLE_NAME = "mdt_transcription_jobs";

export const getTranscriptionJob = async (filename: string, supabase: SupabaseClient) => {
	const { data, error } = await supabase
		.from(TABLE_NAME)
		.select("*")
		.eq("filename", filename)
		.single();

	if (error) {
		throw error;
	}

	return data;
};

export const getTranscriptionJobById = async (id: string, supabase: SupabaseClient) => {
	const { data, error } = await supabase
		.from(TABLE_NAME)
		.select("*")
		.eq("id", id)
		.single();

	if (error) {
		throw error;
	}

	return data;
};

export const beginTranscriptionJob = async (filename: string, supabase: SupabaseClient) => {
	const { data, error } = await supabase
		.from(TABLE_NAME)
		.insert({
			filename,
			status: "pending",
		})
		.single();

	if (error) {
		throw error;
	}

	return data;
};

export const updateTranscriptionJob = async (item: any, supabase: SupabaseClient) => {
	const { data, error } = await supabase
		.from(TABLE_NAME)
		.update({
			...item,
		})
		.eq("filename", item.filename)
		.single();

	if (error) {
		throw error;
	}

	return data;
};
