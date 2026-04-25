import mongoose, { isValidObjectId } from "mongoose"
import { Recipe } from "../models/recipe.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    
    const pipeline = [];

    // filter by userId if provided
    if (userId) {
        if (!isValidObjectId(userId)) throw new ApiError(400, "Invalid User ID");
        pipeline.push({ $match: { owner: new mongoose.Types.ObjectId(userId) } });
    }

    // search query for title or description
    if (query) {
        pipeline.push({
            $match: {
                $or: [
                    { title: { $regex: query, $options: "i" } },
                    { description: { $regex: query, $options: "i" } }
                ]
            }
        });
    }

    // sorting
    const sortField = sortBy || "createdAt";
    const sortOrder = sortType === "asc" ? 1 : -1;
    pipeline.push({ $sort: { [sortField]: sortOrder } });

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    };

    const recipes = await Recipe.aggregatePaginate(Recipe.aggregate(pipeline), options);

    return res
        .status(200)
        .json(new ApiResponse(200, recipes, "Recipes fetched successfully"));
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body

    if (!title || !description) {
        throw new ApiError(400, "Title and description are required");
    }

    // get files from local path (multer middleware)
    const videoFileLocalPath = req.files?.videoFile[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail[0]?.path;

    if (!videoFileLocalPath) throw new ApiError(400, "Video file is required");
    if (!thumbnailLocalPath) throw new ApiError(400, "Thumbnail is required");

    // Upload to Cloudinary
    const videoFile = await uploadOnCloudinary(videoFileLocalPath);
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    if (!videoFile) throw new ApiError(400, "Video upload failed");

    const recipe = await Recipe.create({
        videoFile: videoFile.url,
        thumbnail: thumbnail?.url || "",
        title,
        description,
        duration: videoFile.duration, // Cloudinary provides duration for videos
        owner: req.user._id,
        isPublished: true
    });

    return res
        .status(201)
        .json(new ApiResponse(201, recipe, "Video published successfully"));
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid Video ID");
    }

    const recipe = await Recipe.findById(videoId).populate("owner", "username fullName avatar");

    if (!recipe) {
        throw new ApiError(404, "Recipe not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, recipe, "Recipe fetched successfully"));
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { title, description } = req.body
    const thumbnailLocalPath = req.file?.path;

    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid Video ID");

    if (!title && !description && !thumbnailLocalPath) {
        throw new ApiError(400, "At least one field is required to update");
    }

    const updateData = { title, description };

    if (thumbnailLocalPath) {
        const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);
        if (thumbnail) updateData.thumbnail = thumbnail.url;
    }

    const updatedRecipe = await Recipe.findByIdAndUpdate(
        videoId,
        { $set: updateData },
        { new: true }
    );

    return res
        .status(200)
        .json(new ApiResponse(200, updatedRecipe, "Video details updated successfully"));
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid Video ID");

    const recipe = await Recipe.findByIdAndDelete(videoId);

    if (!recipe) throw new ApiError(404, "Recipe not found");

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video deleted successfully"));
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid Video ID");

    const recipe = await Recipe.findById(videoId);

    if (!recipe) throw new ApiError(404, "Recipe not found");

    recipe.isPublished = !recipe.isPublished;
    await recipe.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, { isPublished: recipe.isPublished }, "Publish status toggled"));
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}