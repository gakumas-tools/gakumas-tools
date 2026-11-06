"use client";
import { createContext, useCallback, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { cleanMemory } from "@/utils/apiValidation";

const DataContext = createContext();

async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(
      `${options?.method || "GET"} ${url} failed with ${response.status}`
    );
  }
  return response;
}

function postJson(url, body) {
  return request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function DataContextProvider({ children }) {
  const { status } = useSession();
  const [memories, setMemories] = useState([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  // One of "load" | "upload" | "delete" when the last request failed.
  const [memoriesError, setMemoriesError] = useState(null);
  const loadingRef = useRef(false);
  const loadedRef = useRef(false);

  const fetchMemories = useCallback(async () => {
    if (status != "authenticated" || loadingRef.current) return;
    loadingRef.current = true;
    setMemoriesLoading(true);
    setMemoriesError(null);
    try {
      const response = await request("/api/memory");
      const data = await response.json();
      setMemories(data.memories);
      loadedRef.current = true;
    } catch (error) {
      console.error(error);
      setMemoriesError("load");
    } finally {
      loadingRef.current = false;
      setMemoriesLoading(false);
    }
  }, [status]);

  const mutateMemories = useCallback(
    async (action, url, body) => {
      setMemoriesError(null);
      try {
        return await postJson(url, body);
      } catch (error) {
        console.error(error);
        // Refetching clears the error first, so report the failure after
        // it unless the refetch failed too.
        await fetchMemories();
        setMemoriesError((current) => current ?? action);
        return null;
      }
    },
    [fetchMemories]
  );

  const putMemories = useCallback((saved) => {
    if (!loadedRef.current) {
      fetchMemories();
      return;
    }
    setMemories((cur) => {
      const byId = new Map(saved.map((memory) => [memory._id, memory]));
      const next = cur.map((memory) => {
        const replacement = byId.get(memory._id);
        byId.delete(memory._id);
        return replacement || memory;
      });
      return next.concat([...byId.values()]);
    });
  }, [fetchMemories]);

  const uploadMemories = useCallback(
    async (memories) => {
      const response = await mutateMemories("upload", "/api/memory", {
        memories,
      });
      if (!response) return false;
      const { ids } = await response.json();
      putMemories(
        memories.map((memory, i) => ({ ...cleanMemory(memory), _id: ids[i] }))
      );
      return true;
    },
    [mutateMemories, putMemories]
  );

  const deleteMemories = useCallback(
    (memoryIds) => {
      const ids = new Set(memoryIds);
      setMemories((cur) => cur.filter((memory) => !ids.has(memory._id)));
      return mutateMemories("delete", "/api/memory/bulk_delete", {
        ids: memoryIds,
      }).then(Boolean);
    },
    [mutateMemories]
  );

  const value = useMemo(
    () => ({
      memories,
      fetchMemories,
      putMemories,
      uploadMemories,
      deleteMemories,
      memoriesLoading,
      memoriesError,
    }),
    [
      memories,
      fetchMemories,
      putMemories,
      uploadMemories,
      deleteMemories,
      memoriesLoading,
      memoriesError,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export default DataContext;
