import {useEffect} from "react";
import baseAxios from "./baseAxios.ts";
import type {AxiosInstance} from "axios";

export const useAxios = (): AxiosInstance => {
    const axiosInstance = baseAxios
    useEffect(() => {
        // 🔹 Request Interceptor
        axiosInstance.interceptors.request.use(
            (request) => {
                return request;
            },
            (error) => Promise.reject(error)
        );

        // 🔹 Response Interceptor
        axiosInstance.interceptors.response.use(
            (response) => {
                return response;
            },
            (error) => {
                console.error("❌ API Error:", error.message);
                return Promise.reject(error);
            }
        );

    }, []);
    return axiosInstance;
};
