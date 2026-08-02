"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api/client";

interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

export function UserMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<{ user: SessionUser | null }>("/api/auth/me"),
    staleTime: 5 * 60 * 1000,
  });

  const logout = useMutation({
    mutationFn: () => api.post("/api/auth/logout", {}),
    onSuccess: () => {
      // Clear every cache before leaving, so the next account that signs in on
      // this device never sees the previous one's data flash on screen.
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
  });

  const user = data?.user;
  const label = user?.displayName || user?.email || "Account";
  const initial = label.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          {user ? (
            <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              {initial}
            </span>
          ) : (
            <User className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal">
          <span className="block text-sm font-medium">{label}</span>
          {user?.displayName && (
            <span className="block truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
