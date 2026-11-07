import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { WorkOrder } from '@/lib/types';
import {
  assignmentRecordOptions,
  assignmentShiftRecordOptions,
} from '@/lib/assignmentPaging';
export function useAssignmentChatRead() {
  const { user } = useAuth(),
    client = useQueryClient(),
    { toast } = useToast();
  const active = useRef(true);
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    record: WorkOrder;
  }>();
  const activeOwner = useRef(user?.id);
  useEffect(() => {
    activeOwner.current = user?.id;
  }, [user?.id]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const resolve = useCallback(
    async (shiftId: string, workOrderId?: string) => {
      if (!user) return undefined;
      try {
        const row = await client.fetchQuery(
          workOrderId
            ? assignmentRecordOptions(user.id, workOrderId)
            : assignmentShiftRecordOptions(user.id, shiftId),
        );
        if (!active.current || activeOwner.current !== user.id)
          return undefined;
        setSnapshot({ owner: user.id, record: row });
        return row;
      } catch (error) {
        if (active.current && activeOwner.current === user.id)
          toast({
            title: 'Unable to open shift chat',
            description:
              error instanceof Error ? error.message : 'Please try again.',
            variant: 'destructive',
          });
        return undefined;
      }
    },
    [client, user, toast],
  );
  return {
    record: snapshot?.owner === user?.id ? snapshot?.record : undefined,
    resolve,
  };
}
